import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`TexTradeOS PRO backend running on http://localhost:${PORT}`);
  console.log("Fresh-install logins: developer/developer123, admin/admin123");
});
