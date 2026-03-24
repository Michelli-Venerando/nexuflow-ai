import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// IMPORTANTE: suportar JSON e form-data (Twilio usa isso)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ROTA TESTE (pra ver se servidor está online)
app.get("/", (req, res) => {
  res.send("Servidor Nexuflow rodando 🚀");
});

// 🔥 WEBHOOK (DEBUG)
app.post("/webhook", (req, res) => {
  console.log("🔥 CHEGOU DO TWILIO 🔥");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  // resposta simples pro Twilio
  res.send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});