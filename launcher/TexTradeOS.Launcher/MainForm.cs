using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace TexTradeOS.Launcher;

internal sealed class MainForm : Form
{
    // ── Brand colors ──────────────────────────────────────────────────────────
    private static readonly Color BrandTeal       = Color.FromArgb(15, 90, 90);     // #0f5a5a
    private static readonly Color BrandTealLight  = Color.FromArgb(214, 232, 232);  // #e1eeee
    private static readonly Color TextPrimary     = Color.FromArgb(21, 25, 27);
    private static readonly Color TextMuted       = Color.FromArgb(125, 143, 143);
    private static readonly Color TextHint        = Color.FromArgb(83, 101, 101);
    private static readonly Color PanelBorder     = Color.FromArgb(184, 202, 202);
    private static readonly Color SoftBorder      = Color.FromArgb(188, 210, 210);
    private static readonly Color SoftPanel       = Color.FromArgb(249, 252, 252);
    private static readonly Color HeaderLine      = Color.FromArgb(198, 216, 216);

    // ── Services / state ──────────────────────────────────────────────────────
    private readonly DeploymentService   _deployment  = new();
    private readonly FingerprintDocument _fingerprint;
    private readonly bool _openOnly;
    private readonly bool _preview;
    private bool _processing;

    // ── Layout constants ──────────────────────────────────────────────────────
    private const int FormW   = 720;
    private const int FormH   = 400;
    private const int CornerR = 20;
    private const int PadX    = 48;
    private const int TopH    = 78;
    private const int BottomH = 88;

    // Top brand
    private const int BrandIconX = 48;
    private const int BrandIconY = 30;
    private const int BrandIconS = 30;

    // Left content
    private const int HeadX = 48;
    private const int HeadY = 124;

    // Progress bar geometry
    private const int ProgX = 48;
    private const int ProgY = 348;
    private const int ProgW = FormW - (PadX * 2);
    private const int ProgH = 3;

    // Right window visual geometry
    private const int StackX = 420;
    private const int StackY = 106;
    private const int StackW = 252;
    private const int StackH = 176;

    // Responsive safety: designed at 720x400, scales down only when the screen
    // or DPI working area is too small. Normal screens stay exactly 720x400.
    private float _uiScale = 1f;

    private int S(int value) => (int)Math.Round(value * _uiScale);
    private Size SS(int width, int height) => new(S(width), S(height));

    private const int WinW = 210;
    private const int WinH = 128;
    private const int WinR = 19;
    private const int WinHeaderH = 34;

    // ── Runtime visual state ──────────────────────────────────────────────────
    private int _progressPct = 0;
    private int _displayPct  = 0;
    private string _statusText = "Initializing workspace...";
    private string _rightStatusText = "";
    private string _versionText = "v1.1.0";

    private DateTime _animationStartedAtUtc = DateTime.UtcNow;

    // ── Timers ────────────────────────────────────────────────────────────────
    private readonly System.Windows.Forms.Timer _animationTimer = new() { Interval = 16 };
    private readonly System.Windows.Forms.Timer _agentTimer     = new() { Interval = 1200 };
    private readonly System.Windows.Forms.Timer _previewTimer   = new() { Interval = 1200 };
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
        AutoScaleMode   = AutoScaleMode.None;
        BackColor       = Color.White;
        ShowInTaskbar   = true;
        TopMost         = true;
        DoubleBuffered  = true;
        KeyPreview      = true;

        ApplyResponsiveScale();
        SetFormRegion();
        LoadLogo();

        _animationTimer.Tick += (_, _) =>
        {
            // Smooth the displayed percentage so the splash feels alive while the
            // real launcher status still controls the target percentage.
            if (_displayPct < _progressPct) _displayPct = Math.Min(_progressPct, _displayPct + 1);
            else if (_displayPct > _progressPct) _displayPct = Math.Max(_progressPct, _displayPct - 1);

            Invalidate();
        };

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

    // ── Responsive/DPI safety ─────────────────────────────────────────────────
    private void ApplyResponsiveScale()
    {
        var area = Screen.FromPoint(Cursor.Position).WorkingArea;

        float maxW = Math.Max(320f, area.Width - 32f);
        float maxH = Math.Max(240f, area.Height - 32f);

        _uiScale = Math.Min(1f, Math.Min(maxW / FormW, maxH / FormH));
        _uiScale = Math.Max(0.78f, _uiScale);

        ClientSize = SS(FormW, FormH);
    }

    // ── Setup helpers ─────────────────────────────────────────────────────────
    private void LoadLogo()
    {
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
                using (stream) _logoImage = new Icon(stream, 64, 64).ToBitmap();
        }
        catch
        {
            // Decorative only — launcher must still run even if the icon is missing.
        }
    }

    private void SetFormRegion()
    {
        using var path = RoundedRect(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), S(CornerR));
        Region = new Region(path);
    }


    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (ClientSize.Width > 0 && ClientSize.Height > 0)
            SetFormRegion();
    }

    // ── Paint ─────────────────────────────────────────────────────────────────
    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode     = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        g.Clear(Color.White);
        g.ScaleTransform(_uiScale, _uiScale);

        DrawSubtleGrid(g);
        DrawTopBar(g);
        DrawLeftContent(g);
        DrawWindowStack(g);
        DrawBottomProgress(g);
        DrawOuterBorder(g);
    }

    private void DrawSubtleGrid(Graphics g)
    {
        using var pen = new Pen(Color.FromArgb(6, BrandTeal), 1f);

        for (int y = TopH; y <= FormH - BottomH; y += 58)
            g.DrawLine(pen, 0, y, FormW, y);

        for (int x = 0; x <= FormW; x += 58)
            g.DrawLine(pen, x, TopH, x, FormH - BottomH);
    }

    private void DrawTopBar(Graphics g)
    {
        using var topBrush = new SolidBrush(Color.White);
        g.FillRectangle(topBrush, 0, 0, FormW, TopH);

        using var linePen = new Pen(HeaderLine, 1f);
        g.DrawLine(linePen, 0, TopH, FormW, TopH);

        DrawLogo(g, new Rectangle(BrandIconX, BrandIconY, BrandIconS, BrandIconS), 8);

        using var brandFont = new Font("Segoe UI", 12f, FontStyle.Bold);
        using var brandBrush = new SolidBrush(BrandTeal);
        g.DrawString("TexTradeOS PRO", brandFont, brandBrush, BrandIconX + 43, 30);

        float pulse = 0.75f + 0.25f * Pulse(1800, 1800);
        using var secureDot = new SolidBrush(WithAlpha(BrandTeal, pulse));
        g.FillEllipse(secureDot, FormW - 165, 36, 7, 7);

        using var secureFont = new Font("Segoe UI", 8.4f, FontStyle.Bold);
        using var secureBrush = new SolidBrush(Color.FromArgb(100, 118, 118));
        g.DrawString("Secure Launch", secureFont, secureBrush, FormW - 150, 31);
    }

    private void DrawLeftContent(Graphics g)
    {
        float headlineA = Anim(220, 550);
        float subA      = Anim(340, 550);
        float pill1A    = Anim(480, 450);
        float pill2A    = Anim(580, 450);
        float pill3A    = Anim(680, 450);

        using var headlineFont = new Font("Segoe UI", 23f, FontStyle.Regular);
        using var headlineBrush = new SolidBrush(WithAlpha(TextPrimary, headlineA));
        g.DrawString(
            "Preparing your\nworkspace",
            headlineFont,
            headlineBrush,
            new PointF(HeadX - (12 * (1 - headlineA)), HeadY));

        using var subtitleFont = new Font("Segoe UI", 9.6f, FontStyle.Regular);
        using var subtitleBrush = new SolidBrush(WithAlpha(TextMuted, subA));
        g.DrawString(
            "TexTradeOS PRO is starting your secure local\nbusiness environment.",
            subtitleFont,
            subtitleBrush,
            new PointF(HeadX - (10 * (1 - subA)), 211));

        DrawPill(g, new Rectangle(48, 263 + (int)(8 * (1 - pill1A)), 72, 28), "Runtime", pill1A);
        DrawPill(g, new Rectangle(128, 263 + (int)(8 * (1 - pill2A)), 76, 28), "Services", pill2A);
        DrawPill(g, new Rectangle(212, 263 + (int)(8 * (1 - pill3A)), 90, 28), "Workspace", pill3A);
    }

    private void DrawPill(Graphics g, Rectangle rect, string text, float opacity)
    {
        using var path = RoundedRect(rect, rect.Height / 2);
        using var fill = new SolidBrush(WithAlpha(Color.White, opacity));
        using var border = new Pen(WithAlpha(PanelBorder, opacity), 1f);
        g.FillPath(fill, path);
        g.DrawPath(border, path);

        using var font = new Font("Segoe UI", 8.3f, FontStyle.Bold);
        using var brush = new SolidBrush(WithAlpha(Color.FromArgb(64, 82, 82), opacity));
        var size = g.MeasureString(text, font);
        g.DrawString(text, font, brush,
            rect.Left + (rect.Width - size.Width) / 2f,
            rect.Top + (rect.Height - size.Height) / 2f - 1f);
    }

    private void DrawWindowStack(Graphics g)
    {
        // Same direction as the approved HTML: clean stacked windows, header dots,
        // separator line, and a logo/content module that belongs to the window body.
        DrawBackWindow(g,
            new Rectangle(StackX + 38, StackY + 8, WinW, WinH),
            0.32f,
            Anim(400, 550),
            new PointF(12, -8));

        DrawBackWindow(g,
            new Rectangle(StackX + 24, StackY + 24, WinW, WinH),
            0.50f,
            Anim(520, 550),
            new PointF(12, -8));

        DrawFrontWindow(g,
            new Rectangle(StackX + 8, StackY + 41, WinW, WinH),
            Anim(680, 650));
    }

    private void DrawBackWindow(Graphics g, Rectangle target, float targetOpacity, float t, PointF offset)
    {
        if (t <= 0f) return;

        var rect = new Rectangle(
            target.X + (int)(offset.X * (1 - t)),
            target.Y + (int)(offset.Y * (1 - t)),
            (int)(target.Width * (0.96f + 0.04f * t)),
            (int)(target.Height * (0.96f + 0.04f * t)));

        float opacity = targetOpacity * t;

        using var path = RoundedRect(rect, WinR);
        using var fill = new SolidBrush(WithAlpha(SoftPanel, opacity));
        using var border = new Pen(WithAlpha(Color.FromArgb(205, 222, 222), opacity), 1f);
        g.FillPath(fill, path);
        g.DrawPath(border, path);

        using var headerFill = new SolidBrush(WithAlpha(Color.White, opacity * 0.75f));
        g.FillRectangle(headerFill, rect.Left, rect.Top, rect.Width, WinHeaderH);
    }

    private void DrawFrontWindow(Graphics g, Rectangle target, float t)
    {
        if (t <= 0f) return;

        var rect = new Rectangle(
            target.X,
            target.Y + (int)(12 * (1 - t)),
            (int)(target.Width * (0.96f + 0.04f * t)),
            (int)(target.Height * (0.96f + 0.04f * t)));

        using var windowPath = RoundedRect(rect, WinR);
        using var fill = new SolidBrush(WithAlpha(Color.White, t));
        using var border = new Pen(WithAlpha(Color.FromArgb(205, 222, 222), t), 1f);
        g.FillPath(fill, windowPath);
        g.DrawPath(border, windowPath);

        var oldClip = g.Clip;
        using (var clipPath = RoundedRect(rect, WinR))
        {
            g.SetClip(clipPath);

            // Header
            using var headerFill = new SolidBrush(WithAlpha(Color.FromArgb(255, 255, 255), t * 0.90f));
            g.FillRectangle(headerFill, rect.Left, rect.Top, rect.Width, WinHeaderH);

            // Header separator line draw
            float lineT = Anim(1100, 550);
            using var linePen = new Pen(WithAlpha(HeaderLine, t * lineT), 1f);
            g.DrawLine(linePen, rect.Left, rect.Top + WinHeaderH, rect.Left + rect.Width * lineT, rect.Top + WinHeaderH);

            // Dots: entry only, no blinking loop
            DrawHeaderDot(g, rect.Left + 14, rect.Top + 14, Anim(1180, 340));
            DrawHeaderDot(g, rect.Left + 26, rect.Top + 14, Anim(1260, 340));
            DrawHeaderDot(g, rect.Left + 38, rect.Top + 14, Anim(1340, 340));

            // Body
            float bodyA = Anim(1220, 420);
            using var bodyFill = new SolidBrush(WithAlpha(Color.White, bodyA));
            g.FillRectangle(bodyFill, rect.Left, rect.Top + WinHeaderH + 1, rect.Width, rect.Height - WinHeaderH - 1);

            DrawContentCard(g, rect, bodyA);
        }

        g.Clip = oldClip;
    }

    private void DrawHeaderDot(Graphics g, int x, int y, float t)
    {
        if (t <= 0f) return;

        float scale = 0.55f + 0.45f * t;
        float s = 6f * scale;
        using var brush = new SolidBrush(WithAlpha(Color.FromArgb(199, 215, 215), t));
        g.FillEllipse(brush, x + (6 - s) / 2f, y + (6 - s) / 2f, s, s);
    }

    private void DrawContentCard(Graphics g, Rectangle windowRect, float bodyOpacity)
    {
        float cardT = Anim(1380, 620);
        if (cardT <= 0f || bodyOpacity <= 0f) return;

        int cardW = 162;
        int cardH = 66;

        var bodyTop = windowRect.Top + WinHeaderH + 1;
        var bodyH = windowRect.Height - WinHeaderH - 1;

        var card = new Rectangle(
            windowRect.Left + (windowRect.Width - cardW) / 2,
            bodyTop + (bodyH - cardH) / 2 + (int)(12 * (1 - cardT)),
            cardW,
            cardH);

        float live = 0.5f + 0.5f * Pulse(2200, 2250);
        var liveFill = Blend(SoftPanel, Color.White, live * 0.35f);
        var liveBorder = Blend(SoftBorder, Color.FromArgb(202, 222, 222), live * 0.45f);

        using var cardPath = RoundedRect(card, 16);
        using var cardFill = new SolidBrush(WithAlpha(liveFill, cardT * bodyOpacity));
        using var cardBorder = new Pen(WithAlpha(liveBorder, cardT * bodyOpacity), 1f);
        g.FillPath(cardFill, cardPath);
        g.DrawPath(cardBorder, cardPath);

        // Icon tile inside module card
        var iconBox = new Rectangle(card.Left + 13, card.Top + 11, 44, 44);
        using var iconPath = RoundedRect(iconBox, 13);
        using var iconFill = new SolidBrush(WithAlpha(Color.White, cardT * bodyOpacity));
        using var iconBorder = new Pen(WithAlpha(Color.FromArgb(210, 226, 226), cardT * bodyOpacity), 1f);
        g.FillPath(iconFill, iconPath);
        g.DrawPath(iconBorder, iconPath);

        float iconT = Anim(1580, 500);
        var iconRect = new Rectangle(iconBox.Left + 6, iconBox.Top + 6, 32, 32);
        if (_logoImage is not null)
        {
            DrawLogo(g, iconRect, 9, iconT * cardT * bodyOpacity);
        }
        else
        {
            DrawLogo(g, iconRect, 9, iconT * cardT * bodyOpacity);
        }

        // Content lines: these make the logo feel part of the actual window/module.
        int lineX = card.Left + 69;
        DrawSoftLine(g, new Rectangle(lineX, card.Top + 19, 66, 4), BrandTeal, 0.20f, Anim(1740, 420) * cardT);
        DrawSoftLine(g, new Rectangle(lineX, card.Top + 30, 50, 4), BrandTealLight, 0.82f, Anim(1860, 420) * cardT);
        DrawSoftLine(g, new Rectangle(lineX, card.Top + 41, 36, 4), BrandTealLight, 0.62f, Anim(1980, 420) * cardT);
    }

    private static void DrawSoftLine(Graphics g, Rectangle rect, Color baseColor, float opacity, float t)
    {
        if (t <= 0f) return;

        int width = Math.Max(1, (int)(rect.Width * t));
        var line = new Rectangle(rect.Left, rect.Top, width, rect.Height);
        using var path = RoundedRect(line, rect.Height / 2);
        using var brush = new SolidBrush(WithAlpha(baseColor, opacity * t));
        g.FillPath(brush, path);
    }

    private void DrawBottomProgress(Graphics g)
    {
        using var statusFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var pctFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var footerFont = new Font("Segoe UI", 9f, FontStyle.Regular);

        using var statusBrush = new SolidBrush(TextHint);
        using var pctBrush = new SolidBrush(BrandTeal);
        using var footerBrush = new SolidBrush(TextMuted);

        g.DrawString(_statusText, statusFont, statusBrush, ProgX, ProgY - 21);

        string pct = $"{_displayPct}%";
        var pctSize = g.MeasureString(pct, pctFont);
        g.DrawString(pct, pctFont, pctBrush, ProgX + ProgW - pctSize.Width, ProgY - 21);

        using var trackPath = RoundedRect(new Rectangle(ProgX, ProgY, ProgW, ProgH), ProgH / 2);
        using var trackBrush = new SolidBrush(BrandTealLight);
        g.FillPath(trackBrush, trackPath);

        int fillW = Math.Max(0, Math.Min(ProgW, (int)(ProgW * (_displayPct / 100f))));
        if (fillW > 0)
        {
            using var fillPath = RoundedRect(new Rectangle(ProgX, ProgY, fillW, ProgH), ProgH / 2);
            using var fillBrush = new SolidBrush(BrandTeal);
            g.FillPath(fillBrush, fillPath);
        }

        g.DrawString("A Product of SparkPair", footerFont, footerBrush, ProgX, ProgY + 15);

        var versionSize = g.MeasureString(_versionText, footerFont);
        g.DrawString(_versionText, footerFont, footerBrush, ProgX + ProgW - versionSize.Width, ProgY + 15);
    }

    private void DrawOuterBorder(Graphics g)
    {
        using var formPath  = RoundedRect(new Rectangle(0, 0, FormW - 1, FormH - 1), CornerR);
        using var borderPen = new Pen(PanelBorder, 1f);
        g.DrawPath(borderPen, formPath);
    }

    // ── Drawing helpers ───────────────────────────────────────────────────────
    private void DrawLogo(Graphics g, Rectangle rect, int radius, float opacity = 1f)
    {
        if (_logoImage is not null)
        {
            // DrawImage is intentionally kept fully opaque in the final settled state.
            // During entry, the surrounding tile/lines provide the animation; this
            // keeps the app icon crisp.
            g.DrawImage(_logoImage, rect);
            return;
        }

        using var path = RoundedRect(rect, radius);
        using var fill = new SolidBrush(WithAlpha(BrandTeal, opacity));
        g.FillPath(fill, path);

        using var font = new Font("Segoe UI", Math.Max(8f, rect.Height * 0.42f), FontStyle.Bold);
        using var brush = new SolidBrush(WithAlpha(Color.White, opacity));
        var text = "t.";
        var size = g.MeasureString(text, font);
        g.DrawString(text, font, brush,
            rect.Left + (rect.Width - size.Width) / 2f,
            rect.Top + (rect.Height - size.Height) / 2f - 1f);
    }

    private static GraphicsPath RoundedRect(
        Rectangle r, int rad,
        bool topLeft     = true, bool topRight    = true,
        bool bottomLeft  = true, bool bottomRight = true)
    {
        var p = new GraphicsPath();
        int d = rad * 2;

        if (topLeft)     p.AddArc(r.Left,       r.Top,        d, d, 180, 90);
        else             p.AddLine(r.Left,      r.Top,        r.Left + rad, r.Top);

        if (topRight)    p.AddArc(r.Right - d,  r.Top,        d, d, 270, 90);
        else             p.AddLine(r.Right - rad, r.Top,      r.Right, r.Top + rad);

        if (bottomRight) p.AddArc(r.Right - d,  r.Bottom - d, d, d,   0, 90);
        else             p.AddLine(r.Right,     r.Bottom - rad, r.Right, r.Bottom);

        if (bottomLeft)  p.AddArc(r.Left,       r.Bottom - d, d, d,  90, 90);
        else             p.AddLine(r.Left + rad, r.Bottom,    r.Left, r.Bottom - rad);

        p.CloseFigure();
        return p;
    }

    private static Color WithAlpha(Color color, float opacity)
    {
        opacity = Math.Clamp(opacity, 0f, 1f);
        return Color.FromArgb((int)(color.A * opacity), color.R, color.G, color.B);
    }

    private static Color Blend(Color a, Color b, float amount)
    {
        amount = Math.Clamp(amount, 0f, 1f);
        return Color.FromArgb(
            (int)(a.A + (b.A - a.A) * amount),
            (int)(a.R + (b.R - a.R) * amount),
            (int)(a.G + (b.G - a.G) * amount),
            (int)(a.B + (b.B - a.B) * amount));
    }

    private float Anim(int delayMs, int durationMs)
    {
        var elapsed = (float)(DateTime.UtcNow - _animationStartedAtUtc).TotalMilliseconds;
        var x = Math.Clamp((elapsed - delayMs) / durationMs, 0f, 1f);
        return EaseOutCubic(x);
    }

    private float Pulse(int periodMs, int delayMs = 0)
    {
        var elapsed = (float)(DateTime.UtcNow - _animationStartedAtUtc).TotalMilliseconds - delayMs;
        if (elapsed < 0) return 0f;

        var phase = (elapsed % periodMs) / periodMs;
        return (float)((Math.Sin(phase * Math.PI * 2) + 1) / 2);
    }

    private static float EaseOutCubic(float x)
    {
        x = Math.Clamp(x, 0f, 1f);
        return 1f - MathF.Pow(1f - x, 3f);
    }

    // ── Status update ─────────────────────────────────────────────────────────
    private void SetStatus(string text, int pct = -1, string rightText = "")
    {
        if (InvokeRequired) { BeginInvoke(() => SetStatus(text, pct, rightText)); return; }

        _statusText = text;
        if (pct >= 0)
        {
            _progressPct = Math.Clamp(pct, 0, 100);
            if (_displayPct == 0 && _progressPct > 0)
                _displayPct = Math.Min(_progressPct, 8);
        }

        if (!string.IsNullOrEmpty(rightText))
            _rightStatusText = rightText;

        Invalidate();
    }

    // ── Init flow ─────────────────────────────────────────────────────────────
    private async Task InitializeAsync()
    {
        _animationStartedAtUtc = DateTime.UtcNow;
        _animationTimer.Start();

        try
        {
            var shownAt = DateTime.UtcNow;

            if (_preview)
            {
                Text = "TexTradeOS PRO Splash Preview";
                _versionText = "Preview - click or press Esc to close";
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
            _animationTimer.Stop();
            SetStatus(error.Message, -1, "Error");
            MessageBox.Show(error.Message, "TexTradeOS PRO",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void AdvancePreview()
    {
        var steps = new[]
        {
            ("Preparing application files...",       20, "Files ready"),
            ("Starting Docker Desktop...",          45, "Docker up"),
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
        var launcherUpdateStarted = false;

        try
        {
            await _deployment.ProcessPendingCommandsAsync(_fingerprint, Log);

            if (updateRequested)
            {
                ShowInTaskbar = true;
                TopMost = true;
                Show();
                BringToFront();

                _animationStartedAtUtc = DateTime.UtcNow;
                SetStatus("Installing TexTradeOS PRO update...", 55, "Updating...");
                launcherUpdateStarted = await _deployment.ProcessRequestedUpdateAsync(Log);
                SetStatus(
                    launcherUpdateStarted
                        ? "Updating TexTradeOS PRO launcher..."
                        : "Opening updated TexTradeOS PRO...",
                    100,
                    "Ready");
            }
        }
        catch (Exception error)
        {
            Log($"Background operation failed: {error.Message}");
        }
        finally
        {
            if (updateRequested)
            {
                await Task.Delay(700);
                if (!launcherUpdateStarted) _deployment.OpenApplication();
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
