import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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

// salva no banco
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

// rota principal
app.post("/webhook", async (req, res) => {
  try {
    const texto = req.body.text;

    const dados = {
  tipo: "pagar",
  descricao: "teste manual",
  valor: 100,
  data: "2026-03-23"
};

    await salvar(dados);

    res.send("Salvo com sucesso");
  } catch (erro) {
    console.error(erro);
    res.status(500).send("Erro");
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});