import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

async function buscarUsuarioPorSupabase(baseUrl, headersRest, userId, email) {
  const select = "select=nome,perfil,empresa_id";
  const filtros = [
    `id=eq.${userId}`,
    `user_id=eq.${userId}`,
    `auth_user_id=eq.${userId}`,
    `usuario_id=eq.${userId}`
  ];
  if (email) {
    filtros.push(`email=eq.${encodeURIComponent(email)}`);
    filtros.push(`e-mail=eq.${encodeURIComponent(email)}`);
  }

  let ultimoErroHttp = null;
  let algumaRespostaOk = false;

  for (const filtro of filtros) {
    const url = `${baseUrl}/rest/v1/usuarios?${filtro}&${select}`;
    const res = await fetch(url, { headers: headersRest });
    const rows = await res.json();
    if (!res.ok) {
      ultimoErroHttp = rows;
      continue;
    }
    algumaRespostaOk = true;
    if (Array.isArray(rows) && rows.length > 0) {
      return { usuario: rows[0], erro: null };
    }
  }

  return {
    usuario: null,
    erro: algumaRespostaOk ? null : ultimoErroHttp
  };
}

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
    const headersRest = {
      apikey: process.env.SUPABASE_KEY,
      Authorization: token
    };

    const { usuario: usuarioRow, erro: usuarioErro } =
      await buscarUsuarioPorSupabase(
        process.env.SUPABASE_URL,
        headersRest,
        userId,
        userData.email
      );

    if (usuarioErro && !usuarioRow) {
      console.error("Supabase usuarios (todas tentativas falharam):", usuarioErro);
      return res.status(502).json({ error: "Erro ao buscar usuário" });
    }

    const usuario = usuarioRow || {};
    let empresaNome = "Empresa";
    const empresaId = usuario.empresa_id;

    if (empresaId) {
      const empRes = await fetch(
        process.env.SUPABASE_URL +
          `/rest/v1/empresas?id=eq.${empresaId}&select=nome`,
        { headers: headersRest }
      );
      const empRows = await empRes.json();
      if (empRes.ok && Array.isArray(empRows) && empRows[0]?.nome) {
        empresaNome = empRows[0].nome;
      }
    }

    const emailUsuario = userData.email;

    res.json({
      nome: usuario.nome || userData.email,
      email: emailUsuario,
      perfil: usuario.perfil || "mestre",
      empresa: empresaNome,
      empresa_id: empresaId ?? null
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

    const headersTrans = {
      apikey: process.env.SUPABASE_KEY,
      Authorization: token
    };
    const { usuario: usuarioTx } = await buscarUsuarioPorSupabase(
      process.env.SUPABASE_URL,
      headersTrans,
      userId,
      userData.email
    );
    const empresa_id = usuarioTx?.empresa_id;

    const transSelect = encodeURIComponent('tipo,"descrição",valentia,dados,status');
    const baseTrans = `${process.env.SUPABASE_URL}/rest/v1/transacoes`;

    async function fetchTransacoesLivres() {
      return fetch(`${baseTrans}?select=${transSelect}`, {
        headers: headersTrans
      });
    }

    let response;
    let data;
    let precisaListarTodas = empresa_id == null;

    if (empresa_id != null) {
      response = await fetch(
        `${baseTrans}?empresa_id=eq.${empresa_id}&select=${transSelect}`,
        { headers: headersTrans }
      );
      data = await response.json();
      if (!response.ok) precisaListarTodas = true;
      else if (Array.isArray(data) && data.length === 0) precisaListarTodas = true;
    }

    if (precisaListarTodas) {
      response = await fetchTransacoesLivres();
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