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

    if (!token) {
      return res.status(401).json({ error: "Não autorizado" });
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
    if (!userResponse.ok || !userData?.id) {
      return res.status(401).json({ error: "Sessão inválida" });
    }
    const userId = userData.id;

    const perfilSelect = encodeURIComponent(
      'nome,"e-mail",perfil,empresa_id,empresas(nome)'
    );
    const perfilResponse = await fetch(
      process.env.SUPABASE_URL +
        `/rest/v1/usuarios?id=eq.${userId}&select=${perfilSelect}`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: token
        }
      }
    );

    const perfilData = await perfilResponse.json();
    if (!perfilResponse.ok) {
      console.error("Supabase usuarios:", perfilData);
      return res.status(502).json({ error: "Erro ao buscar usuário" });
    }

    const usuario = Array.isArray(perfilData) ? perfilData[0] || {} : {};
    const emailUsuario = usuario["e-mail"] ?? usuario.email;

    res.json({
      nome: usuario.nome || userData.email,
      email: emailUsuario || userData.email,
      perfil: usuario.perfil || "mestre",
      empresa: usuario.empresas?.nome || "Empresa",
      empresa_id: usuario.empresa_id ?? null
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
    if (!userResponse.ok || !userData?.id) {
      return res.status(401).send("Sessão inválida");
    }
    const userId = userData.id;

    const perfilResponse = await fetch(
      process.env.SUPABASE_URL +
        `/rest/v1/usuarios?id=eq.${userId}&select=empresa_id`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: token
        }
      }
    );

    const perfilData = await perfilResponse.json();
    const empresa_id = Array.isArray(perfilData) ? perfilData[0]?.empresa_id : undefined;

    if (empresa_id == null) {
      return res.json([]);
    }

    const transSelect = encodeURIComponent('tipo,"descrição",valentia,dados,status');
    const baseTrans = `${process.env.SUPABASE_URL}/rest/v1/transacoes`;

    let response = await fetch(
      `${baseTrans}?empresa_id=eq.${empresa_id}&select=${transSelect}`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: token
        }
      }
    );

    let data = await response.json();

    const apiErro = !response.ok && typeof data === "object" && data !== null;
    const colunaEmpresaAusente =
      apiErro &&
      JSON.stringify(data).toLowerCase().includes("empresa_id");

    if (colunaEmpresaAusente) {
      console.warn(
        "[transacoes] Coluna empresa_id ausente ou inválida; listando todas as linhas (ajuste o schema no Supabase)."
      );
      response = await fetch(`${baseTrans}?select=${transSelect}`, {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: token
        }
      });
      data = await response.json();
    } else if (response.ok && Array.isArray(data) && data.length === 0) {
      response = await fetch(`${baseTrans}?select=${transSelect}`, {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: token
        }
      });
      data = await response.json();
    }

    if (!response.ok) {
      console.error("Supabase transacoes:", data);
      return res.status(502).send("Erro ao buscar transações");
    }

    const lista = Array.isArray(data) ? data : [];
    res.json(
      lista.map((row) => ({
        ...row,
        descricao: row["descrição"] ?? row.descricao,
        valor: row.valentia ?? row.valor
      }))
    );

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