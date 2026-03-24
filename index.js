import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// ============================
// CONFIGURAÇÃO BÁSICA
// ============================

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// necessário para usar index.html no mesmo projeto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// libera arquivos estáticos (index.html)
app.use(express.static(__dirname));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ============================
// FUNÇÃO IA - interpreta texto
// ============================

async function interpretar(texto) {
  const resposta = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: `
Extraia dados financeiros e retorne JSON com:
tipo (pagar ou receber)
descricao
valor
data (YYYY-MM-DD)
NÃO retorne data.
`
      },
      { role: "user", content: texto }
    ]
  });

  return JSON.parse(resposta.choices[0].message.content);
}
// ============================
// SALVAR NO SUPABASE
// ============================

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

// ============================
// ROTA WEBHOOK (IA + SALVAR)
// ============================

app.post("/webhook", async (req, res) => {
  try {
    const texto = req.body.text;

    const dadosIA = await interpretar(texto);

    // 📅 DATA BRASIL
    const hoje = new Date().toLocaleDateString("pt-BR").split("/").reverse().join("-");

    const dados = {
      ...dadosIA,
      data: hoje
    };

    await salvar(dados);

    res.send("Salvo com sucesso");
  } catch (erro) {
    console.error(erro);
    res.status(500).send("Erro ao salvar");
  }
});

// ============================
// ROTA PARA BUSCAR TRANSAÇÕES
// ============================

app.get("/transacoes", async (req, res) => {
  try {
    const response = await fetch(process.env.SUPABASE_URL + "/rest/v1/transacoes", {
      method: "GET",
      headers: {
        "apikey": process.env.SUPABASE_KEY,
        "Authorization": "Bearer " + process.env.SUPABASE_KEY
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (erro) {
    console.error(erro);
    res.status(500).send("Erro ao buscar dados");
  }
});

// ============================
// ROTA INICIAL (ABRE O PAINEL)
// ============================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============================
// INICIAR SERVIDOR
// ============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});