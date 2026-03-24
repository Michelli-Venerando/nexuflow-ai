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

// 👇 NOVA ROTA AQUI
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

// 👇 NÃO MEXER AQUI
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});