using System.Drawing.Drawing2D;

namespace TexTradeOS.Launcher;

internal sealed class MainForm : Form
{
    // ── Brand colors ──────────────────────────────────────────────────────────
    private static readonly Color BrandTeal      = Color.FromArgb(15, 90, 90);    // #0f5a5a
    private static readonly Color BrandTealLight = Color.FromArgb(225, 238, 238); // #e1eeee
    private static readonly Color TextPrimary    = Color.FromArgb(26, 26, 26);
    private static readonly Color TextMuted      = Color.FromArgb(107, 122, 122);
    private static readonly Color TextHint       = Color.FromArgb(138, 153, 153);
    private static readonly Color PanelBorder    = Color.FromArgb(208, 218, 218);

    // ── Services / state ──────────────────────────────────────────────────────
    private readonly DeploymentService   _deployment  = new();
    private readonly FingerprintDocument _fingerprint;
    private readonly bool _openOnly;
    private readonly bool _preview;
    private bool _processing;

    // ── Layout constants ──────────────────────────────────────────────────────
    private const int FormW  = 720;
    private const int FormH  = 400;
    private const int SplitX = 430;   // left panel width / right panel start
    private const int CornerR = 18;
    private const int PadL   = 48;    // left panel horizontal padding

    // Progress bar geometry
    private const int ProgW = 230;
    private const int ProgH = 3;
    private const int ProgX = PadL;
    private const int ProgY = 348;

    // Right panel centre
    private static readonly int RCx = SplitX + (FormW - SplitX) / 2; // 575
    private static readonly int RCy = FormH / 2;                       // 200

    // ── Left-panel labels ─────────────────────────────────────────────────────
    private readonly Label _brandLabel = new()
    {
        AutoSize  = true,
        Text      = "TexTradeOS PRO",
        Font      = new Font("Segoe UI", 12f, FontStyle.Regular),
        ForeColor = BrandTeal,
        BackColor = Color.Transparent,
        Location  = new Point(84, 33),
    };

    private readonly Label _headlineLabel = new()
    {
        AutoSize  = true,
        Text      = "Preparing your\nworkspace",
        Font      = new Font("Segoe UI", 18f, FontStyle.Regular),
        ForeColor = TextPrimary,
        BackColor = Color.Transparent,
        Location  = new Point(PadL, 96),
    };

    private readonly Label _subLabel = new()
    {
        AutoSize  = true,
        Text      = "A Product of SparkPair",
        Font      = new Font("Segoe UI", 9f),
        ForeColor = TextMuted,
        BackColor = Color.Transparent,
        Location  = new Point(PadL, 156),
    };

    private readonly Label _statusLabel = new()
    {
        AutoSize  = true,
        Text      = "Initializing...",
        Font      = new Font("Segoe UI", 8f),
        ForeColor = TextHint,
        BackColor = Color.Transparent,
        Location  = new Point(ProgX, ProgY - 16),
    };

    private readonly Label _versionLabel = new()
    {
        AutoSize  = true,
        Text      = "v1.1.0",
        Font      = new Font("Segoe UI", 8f),
        ForeColor = Color.FromArgb(160, 176, 176),
        BackColor = Color.Transparent,
        Location  = new Point(ProgX, ProgY + ProgH + 8),
    };

    // ── Right-panel status label ───────────────────────────────────────────────
    private readonly Label _rightStatusLabel = new()
    {
        AutoSize  = true,
        Text      = "Starting...",
        Font      = new Font("Segoe UI", 8f),
        ForeColor = Color.FromArgb(140, 255, 255, 255),
        BackColor = Color.Transparent,
    };

    // ── State ─────────────────────────────────────────────────────────────────
    private int   _progressPct = 0;
    private float _spinAngle   = 0f;

    // ── Timers ────────────────────────────────────────────────────────────────
    private readonly System.Windows.Forms.Timer _spinTimer    = new() { Interval = 16 };
    private readonly System.Windows.Forms.Timer _agentTimer   = new() { Interval = 1200 };
    private readonly System.Windows.Forms.Timer _previewTimer = new() { Interval = 900 };
    private int _previewStep;

    // ── Logo bitmap ───────────────────────────────────────────────────────────
    private Image? _logoImage;

    // ─────────────────────────────────────────────────────────────────────────
    internal MainForm(bool openOnly = false, bool preview = false)
    {
        _openOnly    = openOnly;
        _preview     = preview;
        _fingerprint = preview ? new FingerprintDocument() : FingerprintService.Create();

        Text            = "TexTradeOS PRO";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition   = FormStartPosition.CenterScreen;
        ClientSize      = new Size(FormW, FormH);
        BackColor       = Color.White;
        ShowInTaskbar   = true;
        TopMost         = true;
        DoubleBuffered  = true;
        KeyPreview      = true;

        // ── Clip window to rounded rectangle so corners are truly transparent ──
        SetFormRegion();

        // ── Load logo icon ────────────────────────────────────────────────────
        try
        {
            var stream = typeof(MainForm).Assembly
                .GetManifestResourceStream("TexTradeOS.Launcher.favicon.ico");
            if (stream is null)
            {
                var ico = Path.Combine(AppContext.BaseDirectory, "favicon.ico");
                if (File.Exists(ico)) stream = File.OpenRead(ico);
            }
            if (stream is not null)
                using (stream) _logoImage = new Icon(stream, 48, 48).ToBitmap();
        }
        catch { /* decorative — swallow */ }

        // Centre right-status label below the logo tile
        UpdateRightStatusPosition();

        Controls.AddRange([
            _brandLabel, _headlineLabel, _subLabel,
            _statusLabel, _versionLabel, _rightStatusLabel,
        ]);

        foreach (Control control in Controls)
        {
            control.MouseDown += (_, _) =>
            {
                if (_preview) Close();
            };
        }

        _spinTimer.Tick    += (_, _) => { _spinAngle = (_spinAngle + 0.5f) % 360f; Invalidate(); };
        _agentTimer.Tick   += async (_, _) => await ProcessAgentWorkAsync();
        _previewTimer.Tick += (_, _) => AdvancePreview();

        KeyDown += (_, e) =>
        {
            if (_preview && e.KeyCode == Keys.Escape) Close();
        };
        MouseDown += (_, _) =>
        {
            if (_preview) Close();
        };

        Shown += async (_, _) => await InitializeAsync();
    }

    // ── Clip the form window to a rounded rectangle ───────────────────────────
    private void SetFormRegion()
    {
        var path = RoundedRect(new Rectangle(0, 0, FormW, FormH), CornerR);
        Region = new Region(path);
    }

    // ── Paint ─────────────────────────────────────────────────────────────────
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode     = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        // ── Right teal panel ──────────────────────────────────────────────────
        // Fill as a plain rect — the form's Region already clips all four corners,
        // so we don't need to hand-round any corner here. Hand-rounding the right
        // panel's corners with bottomLeft:false left a white triangle at the
        // bottom-left of the panel where the form's curve clip cut in.
        using var tealBrush = new SolidBrush(BrandTeal);
        g.FillRectangle(tealBrush, SplitX, 0, FormW - SplitX, FormH);

        // ── Outer form border ─────────────────────────────────────────────────
        using var formPath  = RoundedRect(new Rectangle(0, 0, FormW - 1, FormH - 1), CornerR);
        using var borderPen = new Pen(PanelBorder, 1f);
        g.DrawPath(borderPen, formPath);

        // ── Right panel rings ─────────────────────────────────────────────────
        DrawRing(g, RCx, RCy, 140, Color.FromArgb(15,  255, 255, 255));
        DrawRing(g, RCx, RCy, 105, Color.FromArgb(23,  255, 255, 255));
        DrawRing(g, RCx, RCy,  72, Color.FromArgb(31,  255, 255, 255));

        // Spinning arc
        using var spinPen = new Pen(Color.FromArgb(102, 255, 255, 255), 2f)
            { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawArc(spinPen, RCx - 105, RCy - 105, 210, 210, _spinAngle, 220f);

        // ── Logo tile: 88×88 frosted square ──────────────────────────────────
        var tile = new Rectangle(RCx - 44, RCy - 44, 88, 88);
        using var tilePath   = RoundedRect(tile, 20);
        using var tileFill   = new SolidBrush(Color.FromArgb(30, 255, 255, 255));
        using var tileBorder = new Pen(Color.FromArgb(51, 255, 255, 255), 1f);
        g.FillPath(tileFill, tilePath);
        g.DrawPath(tileBorder, tilePath);

        if (_logoImage is not null)
            g.DrawImage(_logoImage, new Rectangle(RCx - 26, RCy - 26, 52, 52));

        // ── Dot indicators ────────────────────────────────────────────────────
        int activeDot = (int)(_spinAngle / 120f) % 3;
        for (int d = 0; d < 3; d++)
        {
            var dc = d == activeDot
                ? Color.FromArgb(229, 255, 255, 255)
                : Color.FromArgb(64,  255, 255, 255);
            using var db = new SolidBrush(dc);
            g.FillEllipse(db, RCx - 12 + d * 10, FormH - 22, 5, 5);
        }

        // ── Left panel: logo icon ─────────────────────────────────────────────
        if (_logoImage is not null)
            g.DrawImage(_logoImage, new Rectangle(PadL, 30, 28, 28));

        // ── Progress track + fill ─────────────────────────────────────────────
        using var trackBrush = new SolidBrush(BrandTealLight);
        g.FillRectangle(trackBrush, ProgX, ProgY, ProgW, ProgH);

        int fw = (int)(ProgW * (_progressPct / 100f));
        if (fw > 0)
        {
            using var fillBrush = new SolidBrush(BrandTeal);
            using var fillPath  = new GraphicsPath();
            fillPath.AddRectangle(new Rectangle(ProgX, ProgY, fw, ProgH));
            g.FillPath(fillBrush, fillPath);
        }
    }

    // ── Drawing helpers ───────────────────────────────────────────────────────
    private static void DrawRing(Graphics g, int cx, int cy, int r, Color c)
    {
        using var pen = new Pen(c, 1f);
        g.DrawEllipse(pen, cx - r, cy - r, r * 2, r * 2);
    }

    private static GraphicsPath RoundedRect(
        Rectangle r, int rad,
        bool topLeft     = true, bool topRight    = true,
        bool bottomLeft  = true, bool bottomRight = true)
    {
        var p = new GraphicsPath();
        int d = rad * 2;
        if (topLeft)     p.AddArc(r.Left,      r.Top,          d, d, 180, 90);
        else             p.AddLine(r.Left,      r.Top,          r.Left + rad,   r.Top);
        if (topRight)    p.AddArc(r.Right - d,  r.Top,          d, d, 270, 90);
        else             p.AddLine(r.Right - rad, r.Top,        r.Right,        r.Top + rad);
        if (bottomRight) p.AddArc(r.Right - d,  r.Bottom - d,   d, d,   0, 90);
        else             p.AddLine(r.Right,      r.Bottom - rad, r.Right,        r.Bottom);
        if (bottomLeft)  p.AddArc(r.Left,        r.Bottom - d,   d, d,  90, 90);
        else             p.AddLine(r.Left + rad,  r.Bottom,      r.Left,         r.Bottom - rad);
        p.CloseFigure();
        return p;
    }

    // ── Status update ─────────────────────────────────────────────────────────
    private void SetStatus(string text, int pct = -1, string rightText = "")
    {
        if (InvokeRequired) { BeginInvoke(() => SetStatus(text, pct, rightText)); return; }
        _statusLabel.Text = text;
        if (pct >= 0) _progressPct = pct;
        if (!string.IsNullOrEmpty(rightText))
        {
            _rightStatusLabel.Text = rightText;
            UpdateRightStatusPosition();
        }
        Invalidate();
    }

    private void UpdateRightStatusPosition()
    {
        int labelX = RCx - _rightStatusLabel.Width / 2;
        int labelY = RCy + 44 + 16;
        _rightStatusLabel.Location = new Point(labelX, labelY);
    }

    // ── Init flow ─────────────────────────────────────────────────────────────
    private async Task InitializeAsync()
    {
        _spinTimer.Start();
        try
        {
            var shownAt = DateTime.UtcNow;

            if (_preview)
            {
                Text = "TexTradeOS PRO Splash Preview";
                _versionLabel.Text = "Preview - click or press Esc to close";
                AdvancePreview();
                _previewTimer.Start();
                return;
            }

            if (_openOnly)
            {
                SetStatus("Opening TexTradeOS PRO...", 90, "Launching...");
                await EnsureMinimumSplashTimeAsync(shownAt);
                var lic = LicenseService.Validate(DeploymentService.LicensePath, _fingerprint);
                _deployment.OpenApplication(!lic.Allowed);
                Close();
                return;
            }

            SetStatus("Preparing application files...", 20, "Files ready");
            _deployment.EnsureLayout(_fingerprint);

            SetStatus("Starting Docker Desktop...", 45, "Docker up");
            if (!await _deployment.EnsureDockerAsync(Log))
                throw new InvalidOperationException(
                    "Docker Desktop is not installed or the Docker engine could not start.");

            SetStatus("Starting TexTradeOS PRO services...", 70, "Services up");
            await _deployment.StartAsync(Log);

            SetStatus("Opening TexTradeOS PRO...", 95, "Launching...");
            var license = LicenseService.Validate(DeploymentService.LicensePath, _fingerprint);
            await EnsureMinimumSplashTimeAsync(shownAt);
            _deployment.OpenApplication(!license.Allowed);

            _agentTimer.Start();
            await Task.Delay(700);
            ShowInTaskbar = false;
            TopMost       = false;
            Hide();
        }
        catch (Exception error)
        {
            _spinTimer.Stop();
            SetStatus(error.Message, -1, "Error");
            MessageBox.Show(error.Message, "TexTradeOS PRO",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void AdvancePreview()
    {
        var steps = new[]
        {
            ("Preparing application files...", 20, "Files ready"),
            ("Starting Docker Desktop...",     45, "Docker up"),
            ("Starting TexTradeOS PRO services...", 70, "Services up"),
            ("Opening TexTradeOS PRO...",           95, "Launching..."),
        };
        var (text, pct, right) = steps[_previewStep++ % steps.Length];
        SetStatus(text, pct, right);
    }

    // ── Agent loop ────────────────────────────────────────────────────────────
    private async Task ProcessAgentWorkAsync()
    {
        if (_processing) return;
        _processing = true;
        var updateRequested = File.Exists(DeploymentService.UpdateRequestPath);
        try
        {
            await _deployment.ProcessPendingCommandsAsync(_fingerprint, Log);
            if (updateRequested)
            {
                ShowInTaskbar = true;
                TopMost = true;
                Show();
                BringToFront();
                SetStatus("Installing TexTradeOS PRO update...", 55, "Updating...");
                await _deployment.ProcessRequestedUpdateAsync(Log);
                SetStatus("Opening updated TexTradeOS PRO...", 100, "Ready");
            }
        }
        catch (Exception error) { Log($"Background operation failed: {error.Message}"); }
        finally
        {
            if (updateRequested)
            {
                await Task.Delay(700);
                _deployment.OpenApplication();
                ShowInTaskbar = false;
                TopMost = false;
                Hide();
            }
            _processing = false;
        }
    }

    private static async Task EnsureMinimumSplashTimeAsync(DateTime shownAt)
    {
        var remaining = TimeSpan.FromMilliseconds(1800) - (DateTime.UtcNow - shownAt);
        if (remaining > TimeSpan.Zero) await Task.Delay(remaining);
    }

    private static void Log(string message)
    {
        Directory.CreateDirectory(DeploymentService.Home);
        File.AppendAllText(
            Path.Combine(DeploymentService.DataDirectory, "launcher.log"),
            $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}");
    }
}
