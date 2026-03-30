import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("."));

// TESTE
app.get("/", (req, res) => {
  res.send("Servidor OK");
});

// 🔥 PERFIL
app.get("/perfil", async (req, res) => {
  try {
    const token = req.headers.authorization;

    const userResponse = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          Authorization: token,
          apikey: process.env.SUPABASE_KEY
        }
      }
    );

    const userData = await userResponse.json();
    const userId = userData.id;

    const perfilResponse = await fetch(
      process.env.SUPABASE_URL +
        `/rest/v1/usuarios?id=eq.${userId}&select=nome,email,perfil,empresa_id,empresas(nome)`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: "Bearer " + process.env.SUPABASE_KEY
        }
      }
    );

    const perfilData = await perfilResponse.json();
    const usuario = perfilData[0];

    res.json({
      nome: usuario?.nome,
      email: usuario?.email,
      perfil: usuario?.perfil,
      empresa: usuario?.empresas?.nome || "Empresa",
      empresa_id: usuario?.empresa_id
    });

  } catch (erro) {
    console.error(erro);
    res.status(500).send("Erro ao carregar perfil");
  }
});

// 🔥 TRANSAÇÕES
app.get("/transacoes", async (req, res) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).send("Não autorizado");
    }

    const userResponse = await fetch(
      process.env.SUPABASE_URL + "/auth/v1/user",
      {
        headers: {
          Authorization: token,
          apikey: process.env.SUPABASE_KEY
        }
      }
    );

    const userData = await userResponse.json();
    const userId = userData.id;

    const perfilResponse = await fetch(
      process.env.SUPABASE_URL +
        `/rest/v1/usuarios?id=eq.${userId}&select=empresa_id`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: "Bearer " + process.env.SUPABASE_KEY
        }
      }
    );

    const perfilData = await perfilResponse.json();
    const empresa_id = perfilData[0]?.empresa_id;

    const response = await fetch(
      process.env.SUPABASE_URL +
        `/rest/v1/transacoes?empresa_id=eq.${empresa_id}`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: "Bearer " + process.env.SUPABASE_KEY
        }
      }
    );

    const data = await response.json();

    res.json(data);

  } catch (erro) {
    console.error("Erro:", erro);
    res.status(500).send("Erro ao buscar dados");
  }
});

// 🚀 START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});