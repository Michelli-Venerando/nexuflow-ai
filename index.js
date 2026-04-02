import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

function headersServiceRole() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) return null;
  return { apikey: k, Authorization: `Bearer ${k}` };
}

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

async function jsonOuErro(res) {
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return { message: texto.slice(0, 200) };
  }
}

async function buscarTransacoesPostgrest(baseTrans, headersTrans, empresaId) {
  const sufixosSelect = [
    encodeURIComponent('tipo,"descrição",valentia,dados,status'),
    encodeURIComponent("tipo,descricao,valor,dados,status"),
    "*"
  ];

  async function tentar(queryBase) {
    for (const sel of sufixosSelect) {
      const sep = queryBase.includes("?") ? "&" : "?";
      const q =
        sel === "*" ? `${sep}select=*` : `${sep}select=${sel}`;
      const url = `${baseTrans}${queryBase}${q}`;
      const r = await fetch(url, { headers: headersTrans });
      const data = await jsonOuErro(r);
      if (r.ok && Array.isArray(data)) {
        return { ok: true, data };
      }
      console.warn("[transacoes] tentativa select falhou", sel, r.status, data);
    }
    return { ok: false, data: null, status: 502 };
  }

  if (empresaId != null) {
    const filtrado = await tentar(`?empresa_id=eq.${empresaId}`);
    if (filtrado.ok && filtrado.data.length > 0) return filtrado;
  }

  return tentar("");
}

function parseDataLancamento(row) {
  const raw = row.dados ?? row.data ?? row.data_lancamento;
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) {
      const d = Number(br[1]);
      const m = Number(br[2]) - 1;
      const y = Number(br[3]);
      const dt = new Date(y, m, d, 12, 0, 0);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t);
  }
  return new Date(raw);
}

function filtrarTransacoesPorPeriodo(rows, deStr, ateStr) {
  if (!deStr && !ateStr) return rows;
  const de = deStr ? new Date(`${deStr}T00:00:00`) : null;
  const ate = ateStr ? new Date(`${ateStr}T23:59:59.999`) : null;
  return rows.filter((row) => {
    const t = parseDataLancamento(row);
    if (!t || Number.isNaN(t.getTime())) return false;
    if (de && t < de) return false;
    if (ate && t > ate) return false;
    return true;
  });
}

function parseValorEntrada(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  let s = String(v ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0 && lastDot < 0) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizarDataParaISO(d) {
  if (d == null || d === "") {
    return new Date().toISOString().slice(0, 10);
  }
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const dd = br[1].padStart(2, "0");
    const mm = br[2].padStart(2, "0");
    return `${br[3]}-${mm}-${dd}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function mensagemErroPostgrest(body) {
  if (!body || typeof body !== "object") return "";
  const parts = [
    body.message,
    body.details,
    body.hint,
    body.description
  ].filter(Boolean);
  return parts.join(" — ");
}

async function fetchEmpresaNome(baseUrl, empresaId, userToken) {
  if (!empresaId) return null;
  const svc = headersServiceRole();
  const headers = svc || {
    apikey: process.env.SUPABASE_KEY,
    Authorization: userToken
  };
  const res = await fetch(
    `${baseUrl}/rest/v1/empresas?id=eq.${empresaId}&select=nome`,
    { headers }
  );
  const rows = await res.json();
  if (!res.ok || !Array.isArray(rows) || !rows[0]?.nome) return null;
  return rows[0].nome;
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

    let { usuario: usuarioRow, erro: usuarioErro } =
      await buscarUsuarioPorSupabase(
        process.env.SUPABASE_URL,
        headersRest,
        userId,
        userData.email
      );

    const svc = headersServiceRole();
    if (!usuarioRow && svc) {
      const again = await buscarUsuarioPorSupabase(
        process.env.SUPABASE_URL,
        svc,
        userId,
        userData.email
      );
      usuarioRow = again.usuario;
      if (!usuarioErro) usuarioErro = again.erro;
    }

    if (usuarioErro && !usuarioRow) {
      console.error("Supabase usuarios (todas tentativas falharam):", usuarioErro);
      return res.status(502).json({ error: "Erro ao buscar usuário" });
    }

    const usuario = usuarioRow || {};
    const empresaId = usuario.empresa_id ?? null;
    let empresaNome =
      (await fetchEmpresaNome(
        process.env.SUPABASE_URL,
        empresaId,
        token
      )) || "Empresa";

    const emailUsuario = userData.email;
    const nomePessoa = usuario.nome?.trim() || userData.email?.split("@")[0] || "Usuário";
    const perfilRaw = usuario.perfil || "mestre";

    res.json({
      nome: nomePessoa,
      nome_usuario: nomePessoa,
      email: emailUsuario,
      perfil: perfilRaw,
      empresa: empresaNome,
      empresa_nome: empresaNome,
      empresa_id: empresaId
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
    const baseTrans = `${process.env.SUPABASE_URL}/rest/v1/transacoes`;

    const { ok, data } = await buscarTransacoesPostgrest(
      baseTrans,
      headersTrans,
      empresa_id
    );

    if (!ok || !Array.isArray(data)) {
      return res.status(502).json({
        error: "Erro ao buscar transações",
        detalhe: "Verifique nomes das colunas e políticas RLS no Supabase."
      });
    }

    let lista = data.map((row) => ({
      ...row,
      descricao: row["descrição"] ?? row.descricao,
      valor: row.valentia ?? row.valor
    }));

    const de = req.query.de;
    const ate = req.query.ate;
    if (de || ate) {
      lista = filtrarTransacoesPorPeriodo(lista, de || "", ate || "");
    }

    res.json(lista);
  } catch (erro) {
    console.error("Erro:", erro);
    res.status(500).send("Erro ao buscar dados");
  }
});

function perfilEhMaster(usuario) {
  const p = String(usuario?.perfil || "").toLowerCase();
  return p === "mestre" || p === "master";
}

app.post("/transacoes", async (req, res) => {
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

    const headersUser = {
      apikey: process.env.SUPABASE_KEY,
      Authorization: token,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    const svc = headersServiceRole();
    const headersSvcPost = svc
      ? {
          ...svc,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }
      : null;

    let { usuario: u } = await buscarUsuarioPorSupabase(
      process.env.SUPABASE_URL,
      headersUser,
      userData.id,
      userData.email
    );
    if (!u && svc) {
      const r2 = await buscarUsuarioPorSupabase(
        process.env.SUPABASE_URL,
        svc,
        userData.id,
        userData.email
      );
      u = r2.usuario;
    }

    const empresa_id = u?.empresa_id ?? null;

    const tipo = String(req.body.tipo || "").toLowerCase();
    const descricao = String(req.body.descricao || "").trim();
    const valor = parseValorEntrada(req.body.valor);
    const dados = normalizarDataParaISO(req.body.dados);
    const status = String(req.body.status || "banda").trim() || "banda";

    if (!["pagar", "receber"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo deve ser pagar ou receber." });
    }
    if (!descricao) {
      return res.status(400).json({ error: "Informe a descrição." });
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ error: "Valor inválido." });
    }

    function montarPayloadPT() {
      const p = { tipo, dados, status };
      p["descrição"] = descricao;
      p.valentia = valor;
      if (empresa_id) p.empresa_id = empresa_id;
      return p;
    }

    function montarPayloadEN() {
      const p = { tipo, dados, status, descricao, valor };
      if (empresa_id) p.empresa_id = empresa_id;
      return p;
    }

    async function tentarInsert(headers, payloadJson) {
      const ins = await fetch(`${process.env.SUPABASE_URL}/rest/v1/transacoes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payloadJson)
      });
      const body = await jsonOuErro(ins);
      return { ins, body };
    }

    const tentativasPayload = [
      montarPayloadPT(),
      { ...montarPayloadPT(), status: "ativo" },
      (() => {
        const x = montarPayloadPT();
        delete x.status;
        return x;
      })(),
      montarPayloadEN()
    ];

    const ordemHeaders = headersSvcPost
      ? [headersSvcPost, headersUser]
      : [headersUser];

    let ins = { ok: false };
    let body = null;

    outer: for (const h of ordemHeaders) {
      for (const pl of tentativasPayload) {
        const r = await tentarInsert(h, pl);
        ins = r.ins;
        body = r.body;
        if (ins.ok) break outer;
      }
    }

    if (!ins.ok) {
      console.error("Insert transacao:", body);
      return res.status(502).json({
        error: "Não foi possível salvar o lançamento.",
        detalhe: mensagemErroPostgrest(body)
      });
    }

    const row = Array.isArray(body) ? body[0] : body;
    res.status(201).json({
      ok: true,
      item: {
        ...row,
        descricao: row?.["descrição"] ?? row?.descricao ?? descricao,
        valor: row?.valentia ?? row?.valor ?? valor
      }
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ error: "Erro ao salvar lançamento." });
  }
});

app.post("/usuarios", async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!svc) {
      return res.status(503).json({
        error:
          "Cadastro de usuários requer SUPABASE_SERVICE_ROLE_KEY no servidor (Render)."
      });
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

    const headersUser = {
      apikey: process.env.SUPABASE_KEY,
      Authorization: token
    };
    const svcHeaders = {
      apikey: svc,
      Authorization: `Bearer ${svc}`,
      "Content-Type": "application/json"
    };

    let { usuario: u } = await buscarUsuarioPorSupabase(
      process.env.SUPABASE_URL,
      headersUser,
      userData.id,
      userData.email
    );
    if (!u) {
      const r2 = await buscarUsuarioPorSupabase(
        process.env.SUPABASE_URL,
        svcHeaders,
        userData.id,
        userData.email
      );
      u = r2.usuario;
    }

    if (!perfilEhMaster(u)) {
      return res.status(403).json({ error: "Apenas Master pode cadastrar usuários." });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const nome = String(req.body.nome || "").trim();
    const perfilNovo = String(req.body.perfil || "operador")
      .toLowerCase()
      .trim() || "operador";

    if (!email || !password || password.length < 8) {
      return res.status(400).json({
        error:
          "E-mail e senha são obrigatórios. Use senha com pelo menos 8 caracteres (regra comum no Supabase)."
      });
    }
    if (!nome) {
      return res.status(400).json({ error: "Informe o nome do usuário." });
    }

    const adminRes = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          ...svcHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { nome }
        })
      }
    );
    let created = await jsonOuErro(adminRes);
    if (!adminRes.ok) {
      const msg =
        created?.msg ||
        created?.message ||
        created?.error_description ||
        created?.error ||
        "Falha ao criar usuário no Auth";
      return res.status(400).json({ error: msg });
    }

    if (Array.isArray(created)) {
      created = created[0];
    }

    let newId = created?.id || created?.user?.id || created?.users?.[0]?.id;
    if (!newId) {
      return res.status(502).json({ error: "Resposta inesperada ao criar usuário." });
    }

    const confirmRes = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/admin/users/${newId}`,
      {
        method: "PUT",
        headers: {
          ...svcHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          email_confirm: true,
          password,
          user_metadata: { nome }
        })
      }
    );
    if (!confirmRes.ok) {
      const cBody = await jsonOuErro(confirmRes);
      console.warn("[usuarios] Confirmação pós-cadastro:", cBody);
    }

    const empresa_id = u.empresa_id;
    const rowUsuario = {
      id: newId,
      nome,
      perfil: perfilNovo,
      empresa_id
    };
    rowUsuario["e-mail"] = email;

    let insU = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios`, {
      method: "POST",
      headers: {
        ...svcHeaders,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(rowUsuario)
    });

    if (!insU.ok) {
      const tryAlt = { id: newId, nome, perfil: perfilNovo, empresa_id, email };
      insU = await fetch(`${process.env.SUPABASE_URL}/rest/v1/usuarios`, {
        method: "POST",
        headers: {
          ...svcHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify(tryAlt)
      });
    }

    if (!insU.ok) {
      const errBody = await jsonOuErro(insU);
      console.error("Insert usuarios após auth:", errBody);
      return res.status(502).json({
        error:
          "Usuário criado no login, mas falhou ao gravar na tabela usuarios. Ajuste colunas (e-mail/email) ou RLS.",
        detalhe: errBody?.message || ""
      });
    }

    res.status(201).json({ ok: true, id: newId, email, nome });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ error: "Erro ao cadastrar usuário." });
  }
});

// 🚀 START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});