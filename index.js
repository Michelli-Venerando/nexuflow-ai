import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.static("."));

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
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/*// API de dados
app.get("/transacoes", async (req, res) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).send("Não autorizado");
    }

    // 🔥 pega usuário logado
    const userResponse = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          "Authorization": token,
          "apikey": process.env.SUPABASE_KEY
        }
      }
    );

    const userData = await userResponse.json();

    // 🔥 busca só dados do usuário
    const response = await fetch(
      process.env.SUPABASE_URL +
        "/rest/v1/transacoes?empresa_id=eq." + empresa_id,
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
});*/

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
async function salvar(dados, token) {

  // 🔥 pega usuário
  const userResponse = await fetch(
    process.env.SUPABASE_URL + "/auth/v1/user",
    {
      headers: {
        "Authorization": token,
        "apikey": process.env.SUPABASE_KEY
      }
    }
  );

  const userData = await userResponse.json();

  // adiciona dono do registro
  dados.cliente_id = userData.id;

  const response = await fetch(
    process.env.SUPABASE_URL + "/rest/v1/transacoes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_KEY,
        "Authorization": "Bearer " + process.env.SUPABASE_KEY
      },
      body: JSON.stringify(dados)
    }
  );

  const result = await response.text();
  console.log("Resposta Supabase:", result);
}

// webhook Twilio
app.post("/webhook", async (req, res) => {
  try {
    const texto = req.body.Body;

    console.log("Mensagem recebida:", texto);

    const dados = await interpretar(texto);

    // ⚠️ aqui ainda não temos usuário (WhatsApp)
    // então salva sem cliente_id por enquanto
    await salvar(dados, process.env.SUPABASE_KEY);

    res.send("OK");
  } catch (erro) {
    console.error("Erro:", erro);
    res.status(500).send("Erro");
  }
});

// CRIAR USUÁRIO
app.post("/criar-usuario", async (req, res) => {
  try {
    const { nome, email, perfil } = req.body;

    const senha = Math.random().toString(36).slice(-8);

    const response = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/admin/users",
      {
        method: "POST",
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": "Bearer " + process.env.SUPABASE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password: senha,
          email_confirm: true
        })
      }
    );

    await fetch(
      process.env.SUPABASE_URL + "/rest/v1/usuarios",
      {
        method: "POST",
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": "Bearer " + process.env.SUPABASE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          perfil
        })
      }
    );

    res.json({ sucesso: true, senha });

  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao criar usuário");
  }
});

// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});

/*//CARREGAR PERFIL
app.get("/perfil", async (req, res) => {
  try {
    const token = req.headers.authorization;

    const userResponse = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          "Authorization": token,
          "apikey": process.env.SUPABASE_KEY
        }
      }
    );

    const userData = await userResponse.json();
*/	
app.get("/perfil", async (req, res) => {
  try {
    const token = req.headers.authorization;

    // 🔥 usuário logado
    const userResponse = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          "Authorization": token,
          "apikey": process.env.SUPABASE_KEY
        }
      }
    );

    const userData = await userResponse.json();

    // 🔥 busca perfil
    const perfilResponse = await fetch(
      process.env.SUPABASE_URL +
        "/rest/v1/usuarios?email=eq." + encodeURIComponent(userData.email),
      {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": "Bearer " + process.env.SUPABASE_KEY
        }
      }
    );

    const perfilData = await perfilResponse.json();
    const usuario = perfilData[0];

    // 🔥 busca empresa
    let empresa_nome = "Empresa";

    if (usuario?.empresa_id) {
      const empresaResponse = await fetch(
        process.env.SUPABASE_URL +
          "/rest/v1/empresas?id=eq." + usuario.empresa_id,
        {
          headers: {
            "apikey": process.env.SUPABASE_KEY,
            "Authorization": "Bearer " + process.env.SUPABASE_KEY
          }
        }
      );

      const empresaData = await empresaResponse.json();
      empresa_nome = empresaData[0]?.nome || "Empresa";
    }

    // ✅ resposta correta
    res.json({
      perfil: usuario?.perfil || "master",
      empresa_id: usuario?.empresa_id,
      empresa_nome: empresa_nome,
      nome: usuario?.nome || userData.email
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao buscar perfil");
  }
});

//TRANSAÇÕES
app.get("/transacoes", async (req, res) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).send("Não autorizado");
    }

    // 🔥 pega usuário logado
    const userResponse = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          "Authorization": token,
          "apikey": process.env.SUPABASE_KEY
        }
      }
    );

    const userData = await userResponse.json();

// 🔥 pega empresa do usuário
    const perfilResponse = await fetch(
      process.env.SUPABASE_URL +
        "/rest/v1/usuarios?email=eq." + encodeURIComponent(userData.email),
      {
        headers: {
          "apikey": process.env.SUPABASE_KEY,
          "Authorization": "Bearer " + process.env.SUPABASE_KEY
        }
      }
    );

    const perfilData = await perfilResponse.json();
    const empresa_id = perfilData[0]?.empresa_id;

    // 🔥 busca transações da empresa
    const response = await fetch(
      process.env.SUPABASE_URL +
        "/rest/v1/transacoes?select=*&empresa_id=eq." + empresa_id,
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



