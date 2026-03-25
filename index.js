import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();

// suportar JSON e form-data (Twilio)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// servir o HTML
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// servir o HTML
app.get("/transacoes", async (req, res) => {
  try {
    const response = await fetch(
      process.env.SUPABASE_URL + "/rest/v1/transacoes?select=*",
      {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": "Bearer " + process.env.SUPABASE_KEY
        }
      }
    );

    const data = await response.json();

    res.json(data);
  } catch (erro) {
    console.error("Erro ao buscar dados:", erro);
    res.status(500).send("Erro ao buscar dados");
  }
});

// IA interpreta texto
async function interpretar(texto) {
  const resposta = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: `
Extraia dados financeiros e retorne JSON:
tipo (pagar ou receber)
descricao
valor
data (YYYY-MM-DD)
`
      },
      { role: "user", content: texto }
    ]
  });

  return JSON.parse(resposta.choices[0].message.content);
}

// salvar no Supabase
async function salvar(dados) {
  const response = await fetch(process.env.SUPABASE_URL + "/rest/v1/transacoes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_KEY,
      "Authorization": "Bearer " + process.env.SUPABASE_KEY,
      "Prefer": "return=representation"
    },
    body: JSON.stringify(dados)
  });

  const result = await response.text();
  console.log("Resposta Supabase:", result);
}

// webhook Twilio
app.post("/webhook", async (req, res) => {
  try {
    const texto = req.body.Body;

    console.log("Mensagem recebida:", texto);

    const dados = await interpretar(texto);

    await salvar(dados);

    res.send("OK");
  } catch (erro) {
    console.error("Erro:", erro);
    res.status(500).send("Erro");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});