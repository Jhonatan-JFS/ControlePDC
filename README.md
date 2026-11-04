# Controle PDC — versão online (v1.1)

Organizador pessoal para mensagens de atualização de produtos. O sistema **não** se conecta ao Telegram, ao sistema PDC nem às impressoras: as mensagens e confirmações continuam manuais.

## Acessar

Site: https://jhonatan-jfs.github.io/ControlePDC/

1. Abra o endereço no computador ou celular.
2. Toque em **Entrar com Google** e autentique-se.
3. Aguarde **Sincronizado** antes de cadastrar, editar ou confirmar cargas.
4. Cole o texto do Telegram em **Entrada de mensagens**, confira a prévia e salve.

### Migração da versão local

**Antes de apagar ou substituir a pasta antiga**, abra o `index.html` antigo e clique em **Backup** para baixar o JSON. Entre no novo site online e use **Restaurar** para **mesclar** os registros. Nenhum registro existente é sobrescrito na importação: IDs já presentes são ignorados. Guarde o JSON como cópia de segurança.

> O histórico local do arquivo HTML não migra automaticamente para o endereço online, pois cada origem do navegador possui armazenamento próprio.

## Segurança e armazenamento

- O **GitHub Pages** hospeda só código estático (HTML, CSS e JavaScript). Nenhum histórico é guardado no repositório.
- O **Firebase Authentication** identifica sua conta Google. O **Cloud Firestore** armazena, separadamente, documentos de `items` (produtos), `events` (movimentações) e `batches` (mensagens originais), sob `users/{uid}/...`.
- As regras do Firestore só permitem ler/gravar documentos no caminho correspondente ao UID autenticado. Um visitante anônimo e outro usuário não acessam seus dados.
- Cada alteração grava apenas os documentos alterados em um lote atômico. O site bloqueia novas edições enquanto aguarda a confirmação de sincronização.
- **Exclusão de dia:** ao selecionar a data no calendário e clicar em **Excluir dia**, os produtos daquele dia são marcados como excluídos e desaparecem das pendências atuais e históricas. A **Lixeira** permite restaurar o dia posteriormente; os dados não são eliminados fisicamente nesta versão.
- **Exclusão de item:** segue o mesmo modelo recuperável.
- **Backup JSON manual:** continue exportando backups periodicamente. Backups gerenciados e recuperação pontual do Firestore dependem do plano pago; não estão ativos no Spark.
- Dados podem ser consultados e editados apenas com conexão e sessão confirmadas. Se a conexão falhar, a interface bloqueia alterações para evitar que salvamentos locais sejam confundidos com dados sincronizados.
- A configuração web pública do Firebase em `cloud.js` não é uma chave administrativa. As regras de acesso são a barreira de segurança; nunca inclua credenciais de serviço privadas no repositório.

## Leitura das mensagens

Exemplo:

```text
AUMENTOU
1234 - 2.50
5678 - 5.90

Kit
2908 - aumentou 12.30
1203 - baixou 22.10

PRODUTO NOVO
9012 - Tubo de cola quente transparente - 19.90

PROMOÇÃO
VALIDADE: 15112026
3456 - 7,99
```

- Cabeçalhos de categoria se aplicam às próximas linhas; a categoria escrita no próprio produto tem prioridade.
- Cabeçalhos de família/marca agrupam produtos do mesmo envio, preservando a ordem original.
- CI, CB, nome, valor e validade são extraídos quando informados. Campos ausentes ficam vazios e podem ser corrigidos.
- Valores aceitam ponto ou vírgula como separador decimal. Validade aceita `ddmmaaaa` ou `dd/mm/aaaa`.
- CI repetido é sinalizado sem deduplicação automática. Linhas não reconhecidas ficam na prévia.

## Painel e histórico

- **Pendente de Carga** → **Carga Enviada** → **Impressão confirmada**, sempre por ação manual.
- Itens incompletos do dia anterior continuam no painel e recebem marcação laranja.
- Calendário e filtros permitem conferir os dias. A lixeira é independente das datas ativas.
- Cada cabeçalho de família possui seleção em lote; há seleção de resultados de busca, categoria em lote, notas, filtros e **Desfazer**.
- A busca dentro do Painel do dia permite pesquisar por cabeçalho/família ou por item, selecionando os resultados em um clique.

## Implantação

- Repositório público somente para permitir GitHub Pages no plano GitHub Free.
- GitHub Pages: branch `main`, pasta `/(root)`.
- Firebase: projeto `controlepdc-41408`, Firestore Standard (São Paulo), Authentication/Google habilitado; domínio autorizado `jhonatan-jfs.github.io`.
- As regras de acesso vigentes estão espelhadas em [firestore.rules](firestore.rules); alteração desse arquivo no GitHub **não** publica regras automaticamente no Firebase. Aplique-as pelo console de regras.
- Se um recurso do Firebase tiver erro de permissão, não ative "modo de teste" nem permita acesso público como solução. Verifique login, domínio e regras.

O app não altera a rede da loja, PDVs, servidores Radmin ou impressoras.
