# Bíblia Católica — PWA

Site e aplicativo (PWA) da Bíblia Sagrada católica, 73 livros, tradução do Pe. Manuel de Matos Soares.
Funciona offline, pode ser instalado no celular ou no computador e roda no GitHub Pages sem build.

Texto: [bibliacatolica/biblia](https://github.com/bibliacatolica/biblia) (CC0 / domínio público).

## Funcionalidades

- **Leitura:** livros por seção (Pentateuco, Históricos, Sapienciais…), grade de capítulos, anterior/próximo, gesto de deslizar, setas do teclado, modo imersivo, retomada da posição de leitura.
- **Ir para referência:** `Jo 3,16`, `joao 3:16-18`, `1 Cor 13`, `Sl 22`. Funciona na busca, no início e no seletor de passagem.
- **Busca:** ignora acentos e maiúsculas. Modos: todas as palavras, frase exata ou qualquer palavra. Opção de palavras inteiras. Filtro por Bíblia, testamento, seção ou livro. Contagem por livro, termos destacados e buscas recentes.
- **Marcações:** destaques em 5 cores, favoritos e notas (também para vários versículos). Tudo fica listado em *Salvos*, com filtros, ordem bíblica ou por data, e opção de desfazer.
- **Copiar e compartilhar** versículos com a referência formatada (`Jo 3,16-18.20`), além de link direto para o versículo.
- **Planos de leitura:** Bíblia em 1 ano, AT em 1 ano, NT em 90 dias, Evangelhos em 40 dias, Salmos em 30 dias e Sapienciais em 60 dias. Os dias são equilibrados pelo número de versículos e mostram atraso e progresso.
- **Versículo do dia**, progresso de leitura (capítulos lidos) e histórico.
- **Ouvir:** leitura em voz alta (Web Speech API) com destaque do versículo, escolha de voz e velocidade, e continuação no capítulo seguinte.
- **Aparência:** dois estilos, *Vitral* (claro, com uma cor para cada seção da Bíblia) e *Noturno* (escuro, calmo). O modo *Automático* segue o claro/escuro do aparelho.
- **Cores litúrgicas:** verde, roxo, branco/dourado, vermelho e rosa. A opção *Tempo litúrgico* troca a cor sozinha conforme o tempo do ano (Advento, Natal, Quaresma, Páscoa, Pentecostes, Tempo Comum e alguns domingos próprios). Não inclui festas de santos.
- **Texto:** tamanho da letra, fonte, entrelinhas, largura, versículos em linhas ou texto corrido, números dos versículos e texto justificado.
- **PWA:** instalação, uso offline (botão para baixar a Bíblia inteira), aviso de nova versão e atalhos no ícone.
- **Backup:** exportar e importar os dados do usuário em JSON. Os dados ficam só no navegador (`localStorage`).
- Os Salmos usam a numeração da Vulgata. O leitor mostra a numeração hebraica correspondente.

## Estrutura

```
docs/                 site publicado (GitHub Pages)
  index.html          casca do app
  css/app.css         estilos e temas
  js/app.js           rotas, telas e interações
  js/bible.js         dados, referências e busca
  js/store.js         dados do usuário (localStorage)
  js/plans.js         planos de leitura e versículo do dia
  js/tts.js           leitura em voz alta
  js/liturgy.js       tempo e cor litúrgica do dia
  sw.js               service worker (offline)
  data/index.json     metadados dos livros
  data/books/*.json   texto (um arquivo por livro)
  icons/              ícones do PWA
scripts/
  build-data.mjs      gera docs/data a partir do JSON CC0
  make-icons.mjs      gera os ícones PNG
  check.mjs           testes rápidos da lógica
```

## Rodar localmente

```bash
cd docs
python -m http.server 8000
# abra http://localhost:8000
```

O service worker guarda os arquivos em cache. Durante o desenvolvimento, use o DevTools: *Application → Service workers → Update on reload*.

## Publicar no GitHub Pages

1. Envie o repositório ao GitHub.
2. Abra *Settings → Pages → Build and deployment*.
3. Escolha *Deploy from a branch*, branch `main` e pasta `/docs`.

O site fica em `https://<usuario>.github.io/<repositorio>/`. Todos os caminhos são relativos, então qualquer nome de repositório funciona.

**A cada nova versão:** aumente `VERSION` em `docs/sw.js` (e `APP_VERSION` em `docs/js/app.js`). Assim os usuários recebem o aviso "Nova versão disponível".

## Atualizar o texto bíblico

```bash
node scripts/build-data.mjs     # baixa a versão mais recente do repositório CC0
node scripts/check.mjs          # valida referências, busca e planos
```

Depois aumente `DATA_VERSION` em `docs/sw.js`.

## Direitos autorais

A pasta `source/` (EPUBs da Paulinas e da Editora Santuário) está no `.gitignore`. Essas edições têm direitos autorais e **não podem** ser publicadas.
