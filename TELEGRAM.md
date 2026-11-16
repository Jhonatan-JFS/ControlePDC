# Telegram no Controle PDC — primeira integração de navegador

## Objetivo e alcance
A terceira aba **Telegram** é independente de **Controle PDC** e **Solicitações**. Permite configurar um destino real do Telegram **por grupo e, em grupos com fórum, por tópico (subchat)**, associar **mais de um modelo** ao mesmo destino, preparar mensagem, confirmar envio e sincronizar mensagens **sob demanda**.

### Como conectar (sem bot, sem APK)
1. Entre no site publicado via Google, abra **Telegram → Configurações**.
2. Obtenha seu **API ID** e **API hash** pelo portal oficial https://my.telegram.org > API development tools, com sua própria conta. **Nunca compartilhe esses dados no chat.**
3. Digite API ID, API hash, número com DDI e uma **senha local de proteção** com pelo menos 12 caracteres. O Telegram poderá solicitar um código enviado a outro dispositivo, e a senha de duas etapas.
4. O site se comunica diretamente com os servidores Telegram pelo WebSocket MTProto usando a biblioteca `teleproto` e grava a sessão **cifrada por AES-GCM/PBKDF2 no armazenamento deste navegador**. A senha local não é enviada ao Telegram, não é incluída no GitHub e não é salva.
5. Em **Grupos e modelos**, adicione um destino, escolha o grupo real. Se o grupo possuir tópicos (fórum), **selecione também o tópico específico** antes de vincular. Marque os modelos que devem ir a esse tópico, por exemplo Cadastro de Produto e Alteração de Nomenclatura. Um mesmo grupo pode ser utilizado por diversos destinos, em tópicos diferentes.
6. Em **Nova solicitação**, escolha o modelo: a aba selecionará automaticamente o destino configurado. Confira a prévia e confirme o envio.
7. Em **Monitoramento**, clique em **Sincronizar agora** para capturar novas mensagens relevantes e revisar reações das solicitações anteriores.

## Regras
- Cada solicitação enviada pelo usuário em um grupo vinculado é vinculada ao ID da mensagem original.
- **Qualquer reação** significa **Conferido**; a remoção da **última** reação reverte para **Não conferido** na próxima sincronização. O histórico da mudança é preservado.
- Uma mensagem contendo vários produtos é uma solicitação com vários itens, na ordem da mensagem; uma reação confirma a mensagem inteira.
- Modelo de atualização de CB: `[CI] - [nome do produto]` e logo abaixo `CB: [código]`, com **uma linha em branco entre itens**.
- Leitura de mensagens de terceiros nesta primeira versão: identifica padrões explícitos de aumento/queda de preços ou menção a produtos novos. Regras adicionais serão configuradas por módulo.
- Sem acesso ao Solidcon, sem automação de impressão, sem envio silencioso.

## Limites atuais
- A sessão do Telegram, os vínculos de grupos, os rascunhos e o histórico de leitura são **locais a este navegador/dispositivo**. O conteúdo de mensagens capturadas no histórico local ainda não está cifrado; evite usar em computadores compartilhados. Não há sincronização entre celulares ou backup de histórico no Firebase nesta etapa.
- A conexão só fica ativa enquanto o site estiver aberto. Não há captura instantânea 24/7. Uma reconexão e nova sincronização recuperam o histórico **ainda disponível** a partir do ID de cada grupo.
- **Primeira sincronização**: somente as 200 mensagens mais recentes de cada grupo vinculado. Sincronizações seguintes: recuperam em lotes as mensagens posteriores; se houver muitas, poderá ser preciso acionar novamente.
- Mensagens apagadas antes da consulta não podem ser recuperadas; reações adicionadas e removidas entre duas leituras podem não deixar rastro.
- Dependência de conexão Telegram real e autenticação do usuário. O projeto não inclui credenciais nem conta pré-autorizada; sem esses dados, o monitor não lê nada.
- Não foi possível testar a autenticação real sem uma conta Telegram autorizada. O código e a compilação do cliente web foram validados; a primeira autenticação e a leitura de grupos devem ser verificadas no próprio navegador do usuário.
- O app opera sobre a conta do Telegram com permissões amplas; revogue sessões não reconhecidas em Telegram → Configurações → Dispositivos.

## Grupos com tópicos (fórum)
- O seletor exibe os tópicos disponíveis quando a conversa possui o modo **Fórum** ativado. Use **Atualizar tópicos** se um tópico tiver sido criado ou renomeado recentemente.
- O tópico **Geral** é identificado por ID 1, e o envio ocorre normalmente sem responder a uma mensagem. Outros tópicos recebem as mensagens como respostas ao ID de criação do tópico.
- Cada destino salva **ID do grupo + ID do tópico**, sem confundir um tópico com outro. É possível cadastrar dois destinos apontando para tópicos diferentes do mesmo grupo, cada qual com seus modelos.
- Na sincronização, cada tópico configurado possui cursor independente de leitura; as solicitações registram o tópico de origem, permitindo revisar reações de mensagens específicas.
- **Limitação de leitura:** o tópico Geral é filtrado no histórico global do grupo. A primeira leitura é limitada às 200 mensagens mais recentes deste histórico. Para tópicos nomeados, a leitura é feita pela thread específica, também limitada inicialmente às 200 mais recentes. Mensagens antigas anteriores à primeira sincronização podem ficar fora da janela inicial.
- Tópicos fechados aparecem identificados e não podem ser selecionados como destino de envio.

## Configuração guiada de destinos e modelos (interface)
- A aba Telegram possui uma **sidebar recolhível** com Nova solicitação, Grupos, tópicos e modelos, Monitoramento e Configurações. O botão Menu Telegram abre/oculta o painel; em celulares ele começa fechado.
- Em **Grupos, tópicos e modelos**, o assistente visual oferece 3 etapas: (1) escolher ou criar destino, (2) selecionar grupo e tópico reais, (3) marcar todos os modelos que esse tópico receberá.
- Um mesmo grupo real aceita múltiplos destinos locais quando os tópicos são diferentes. Um destino pode receber vários modelos: por exemplo, Cadastro de Produto + Alteração de Nomenclatura no tópico Cadastros, e Atualização de CB no tópico Códigos de Barras.
- O **resumo dos destinos** mostra qual grupo/tópico e quais modelos estão associados. Ao transferir um modelo já vinculado, o site exige confirmação; não altera o vínculo silenciosamente.
- Em **Nova solicitação**, os 13 modelos e campos seguem a página Solicitações existente. O destino aparece automaticamente em função do modelo; o usuário revisa o texto antes de enviar. A página Solicitações original e o fluxo da Supervisão não foram alterados.
- O padrão das mensagens com múltiplos produtos mantém o nome original e códigos separados e legíveis, incluindo linha em branco entre os blocos.


## Novo modelo: Cadastro com NF-e
Na terceira aba Telegram → Nova solicitação → Cadastros, foi incluído **Cadastro com NF-e**, separado do modelo Cadastro de Produto já existente. Campos obrigatórios: **Nome da empresa**, **Número da NF-e** e **Nome de cada produto**. Campos opcionais por produto: CB e Venda (R$). É permitido incluir vários produtos por nota.

Formato exato (CB e venda aparecem somente se preenchidos):

\`\`\`text
Por favor, cadastrar:
Empresa [Nome da empresa]; NF-e: [Número da nota].
[Nome do produto]
CB: [Código de barras]
Venda: [Valor de venda]

[Outro produto]
\`\`\`

Os produtos ficam na ordem de digitação, com uma linha em branco entre os blocos. Valores preenchidos são formatados com duas casas decimais em padrão brasileiro. Ao escolher este novo modelo, será necessário configurar seu destino (grupo/tópico) em Grupos, tópicos e modelos, como em qualquer outro modelo.

## Identidade visual da terceira aba
Inspirada na estrutura do protótipo \`monitor_telegram_demo.html\`: cores escuras, painéis com bordas discretas, cartões de indicadores, status de conferência e hierarquia de leitura. A nova paleta usa azul-petróleo, grafite, ciano e verde de confirmação, em vez de copiar a paleta do protótipo. A estilização fica em \`telegram-tema.css\` com escopo \`#telegramPage\` para não alterar **Controle PDC** ou **Solicitações**.

## Monitoramento independente — quarta aba principal

O site possui **quatro abas principais**: Controle PDC, Solicitações, Telegram (envio e configuração de modelos) e **Monitoramento** (leitura de mensagens). Monitoramento não aparece mais dentro da sidebar de Telegram.

Na aba **Monitoramento**, o botão **Selecionar grupos e tópicos** permite escolher exatamente quais grupos e quais tópicos de fórum devem ser consultados. Essa seleção é salva no navegador usando uma chave local própria, sem depender do vínculo de modelos de envio. Por exemplo, é possível enviar Cadastro e Nomenclatura para um tópico e optar por monitorar somente outro grupo.

Na parte superior do monitoramento surgem **abas horizontais com os grupos escolhidos**. Clicar em uma aba altera os resultados e os indicadores para aquele grupo. Se o grupo possui tópicos, há filtros logo abaixo para mostrar todos os tópicos selecionados ou somente um deles.

- **Sincronizar selecionados** busca novas mensagens somente nos grupos/tópicos monitorados e reconsulta as reações das mensagens anteriormente registradas que pertencem a essas fontes.
- A remoção de um grupo ou tópico do monitoramento **não apaga seu histórico local** e **não altera os modelos ou destinos das solicitações**.
- O histórico é filtrado na apresentação por grupo/tópico; mensagens de fontes desmarcadas não aparecem na lista, mesmo que existam no histórico local.
- A primeira sincronização ainda obedece à janela inicial do cliente (até 200 mensagens recentes por fonte, quando aplicável). A sincronização é sob demanda, não 24 horas, e não recupera mensagens apagadas antes da consulta.
- As preferências de monitoramento ficam somente no navegador atual. Para acompanhar grupos em outro aparelho, é necessário configurá-los nele.


## Monitoramento de mensagens enviadas e recebidas

Em cada grupo/tópico monitorado, há **duas visualizações independentes**: **Minhas mensagens** (mensagens da conta conectada) e **Mensagens recebidas** (mensagens de outros participantes).

**Mensagens recebidas** possuem filtros: Todas, Solicitações dos colegas, Alterações de preço, Produtos novos e Outras. Não se descarta uma mensagem recebida só porque ela não corresponde a um modelo reconhecido; nesse caso ela aparece em Outras. Se uma solicitação de colega vier sem um cabeçalho reconhecível, é possível usar **Marcar como solicitação** para permitir sua conferência no próximo clique em Sincronizar selecionados.

**Qualquer reação em mensagem de solicitação**, enviada pela própria conta ou por outra pessoa, significa Conferido. Sem reações significa Não conferido. Se a última reação for removida, a próxima sincronização reverte automaticamente o status; registrar a alteração não comprova que o Solidcon foi efetivamente atualizado. A conferência é por mensagem inteira, não por cada produto individual. A sincronização reconsulta reações de todas as solicitações salvas nos grupos/tópicos escolhidos.

A classificação inicial prioriza comandos de solicitação (ex.: Por favor, cadastrar, atualizar CB, alterar nomenclatura), depois avisos de preço (ex.: AUMENTOU, ABAIXOU) e produtos novos. Outras mensagens recebidas ficam visíveis e não são silenciosamente descartadas.

### Compatibilidade com histórico anterior
O monitoramento anterior armazenava principalmente as mensagens da conta conectada e alguns avisos reconhecidos de terceiros. Na primeira sincronização de cada grupo/tópico após a atualização, a integração faz uma reconsulta das **200 mensagens mais recentes disponíveis** para recuperar parte das mensagens de colegas que o filtro antigo ignorava, sem apagar os registros ou reiniciar os marcadores de leitura. Mensagens mais antigas que essa janela ou apagadas antes da consulta podem não ser recuperáveis.


## Relatório TXT simples por grupo e tópico (Monitoramento)

O relatório TXT é uma **lista operacional**, voltada à cópia rápida de CIs e CBs para o sistema. A estrutura detalhada anterior (identificadores de mensagens, histórico, observações, valores e metadados) foi removida do **arquivo TXT**, mas o histórico original continua preservado no monitoramento.

Na quarta aba **Monitoramento**, use o botão **Relatório TXT**, selecione um grupo/tópico, informe a data e hora inicial e escolha **Visualizar TXT** ou **Copiar relatório** (copia a lista inteira para colar no sistema, sem salvar arquivo). Filtros de autoria e tipo de mensagem continuam disponíveis. A prévia exibe os botões **Copiar CI** e **Copiar CB** por produto, usando a área de transferência do navegador.

A lista agrupa por **material/marca explicitamente identificado no cabeçalho da mensagem**, por exemplo:

```text
PRAFESTY

82840 - KIT PINCEL K20 #0 - AUMENTOU
CB: 7890265569137

6752 - KIT PINCEL K20 #2 - BAIXOU
CB: 7890265569144

TILIBRA

49040 - CADERNO 10 MATÉRIAS
CB: 1234567890001
```

Somente **uma entrada por CI** aparece no relatório, com a descrição, CB e última direção de preço explicitamente registrados nas mensagens desde o filtro inicial. Campos ausentes são omitidos; não se inventa título, descrição, CB nem aumento/queda. Quando não se reconhece o material por cabeçalho, os itens ficam em **MATERIAL NÃO INFORMADO**; o usuário pode fornecer um **material para itens sem título** (opcional) no formulário.

**Importante:** o TXT é gerado exclusivamente com o histórico já sincronizado no navegador e respeita o corte de data/hora. Não acessa o Solidcon e não confirma alterações no sistema. Clique em **Sincronizar selecionados** antes de exportar para obter as mensagens mais recentes. O arquivo preserva CI e CB em linhas separadas, com uma linha em branco entre produtos.


## Comparação visual dos avisos de preços no Monitoramento

Na aba **Monitoramento → Mensagens recebidas → Alterações de preço**, cada aviso reconhecido apresenta:

- **AUMENTOU** em vermelho ou **BAIXOU** em verde, com indicação textual e borda correspondente.
- Uma linha/cartão por **CI**, com descrição quando fornecida, valor **Antes → Atual** e CB se disponível.
- Quando a própria mensagem informa explicitamente **De/Antes** e **Para/Atual/Venda**, o painel usa os preços citados.
- Caso contrário, **Antes** mostra o último preço explicitamente registrado em aviso anterior do **mesmo CI, grupo e tópico**, com identificação **Antes · último aviso**. Não mistura informações de grupos ou tópicos distintos.
- Se o valor anterior ou atual não estiver disponível nas mensagens sincronizadas, mostra **Não informado**; não inventa valores.
- Se o sentido escrito (AUMENTOU/BAIXOU) contradizer os valores numéricos, mostra um aviso de conferência.
- Texto original do Telegram fica acessível em **Ver mensagem original**.

A classificação visual utiliza o conteúdo das mensagens de outros participantes e o histórico local; não consulta nem confirma valores do Solidcon. A sincronização continua manual, por grupo/tópico escolhido. O **TXT simplificado por material/CI/CB** permanece sem alteração.


## Conexão, sincronização e histórico salvo — nova organização

**A data inicial não é mais configurada na página Monitoramento.** Para escolher o ponto de partida, abra a aba principal **Telegram** e clique no botão **Conexão e sincronização** no cabeçalho (não é necessário abrir a sidebar). Essa página mostra a conexão da conta (com senha local) e, logo abaixo, o painel **Sincronizar mensagens**.

1. Em **Grupo ou tópico**, selecione uma conversa monitorada ou **Todos os grupos/tópicos monitorados**. A seleção de monitoramento continua sendo feita em Monitoramento → Selecionar grupos e tópicos, separada dos destinos de envio.
2. Em **Sincronizar a partir de:** escolha uma data e hora, por exemplo 12/11/2026 às 14:30, no fuso local do navegador. Clique em **Salvar data inicial** para conservar o valor. Se estiver em Todos, a data escolhida será aplicada a todos os grupos/tópicos monitorados; é possível definir datas diferentes selecionando cada tópico separadamente.
3. Toque em **Sincronizar agora** (todos ou o tópico selecionado). O site também salva uma data nova digitada antes de iniciar a leitura. Caso as fontes tenham datas diferentes e o seletor Todos exiba data em branco, a sincronização respeita as datas individuais já salvas.
4. Abaixo, há três indicadores: **Última sincronização concluída** (somente sem erros ou pendências), **Última tentativa** (inclui execuções parciais) e **Última mensagem registrada**. **Histórico de sincronizações** é recolhível e guarda até 20 execuções recentes com data/hora, estado e contagem. Também exibe o status, a data inicial e a última data de coleta/conclusão de cada grupo ou tópico.

Ao definir a data inicial e sincronizar, a recuperação localiza por ID cronológico o ponto próximo do horário escolhido e percorre o histórico do Telegram em páginas, preservando seu progresso e registros entre tentativas. Se alguma parte ainda estiver pendente, o resultado será **parcial** e o histórico avisará para continuar a sincronização, sem afirmar que terminou. O painel Monitoramento continua exibindo as mensagens, os filtros, as reações e os relatórios TXT, mas passou a ter apenas um atalho **Configurar sincronização** para retornar a essa área.

**Persistência:** a última tentativa antiga continua salva para compatibilidade. Novas datas completas são guardadas por fonte, e o histórico retém até 20 execuções. As mensagens originais permanecem no armazenamento local do navegador, sem apagar registros quando a data de início muda. Não significa armazenamento na nuvem nem sincronização entre aparelhos: limpar dados do navegador pode apagar registros e preferências locais.

Mensagens que o Telegram não fornece à conta (apagadas, inacessíveis ou ocultas por permissões) não poderão ser recuperadas. A sincronização é iniciada manualmente e não ocorre continuamente em segundo plano.


## Origem do relatório TXT: todos os tópicos do grupo

A caixa **Tópico do Telegram para o relatório**, na aba Monitoramento → Relatório TXT, consulta **todos os tópicos reais do grupo selecionado**, e não apenas os que já estão marcados para monitoramento. Assim, é possível selecionar **Atualizações de preços** mesmo quando só Cadastros havia sido selecionado no monitoramento. O tipo **Atualizações de preços (AUMENTOU/BAIXOU)** é o filtro de conteúdo; não é o nome nem a seleção de um tópico.

Se o tópico aparecer com **(não monitorado)**, clique em **Incluir no monitoramento** para habilitá-lo, sem alterar os demais. Depois acesse **Telegram → Conexão e sincronização**, informe a data inicial, e sincronize o tópico para capturar suas mensagens. Só então o TXT poderá incluir mensagens ainda não coletadas. O relatório continua separando o conteúdo por grupo e tópico; não inventa registros e não reúne tópicos distintos no mesmo arquivo.

A lista completa depende de estar conectado ao Telegram com permissão de leitura. Sem conexão, o seletor mostra provisoriamente somente os tópicos já cadastrados no monitoramento. Se o tópico desejado pertencer a outro grupo, selecione antes esse grupo na barra de grupos do Monitoramento.


## Correção de integridade do relatório de preços (12/11/2026)

O TXT de preços agora respeita a **ordem cronológica da primeira aparição das marcas** e a **ordem dos produtos dentro de cada marca**, em vez de ordenar marcas alfabeticamente. Continua exibindo **um registro por CI**, atualizado com a última alteração encontrada no recorte.

O interpretador aceita os formatos reais usados pelos participantes:
- `83971 ABAIXOU PARA 11,50` (sem hífen após CI).
- `168465 - AUMENTOU PARA 4,99` (com hífen).
- `90386 - DIMINUIU PARA 25,99` (redução explícita).
- `82840 - KIT PINCEL - AUMENTOU PARA 9,46` (descrição e valor).
- Títulos em linhas próprias, por exemplo `ULTRAFEST`, `ART LATEX`, `MAVALÉRIO`, com vários produtos abaixo.

A saída preserva a **marca**, o **CI**, a **descrição quando existir**, a direção e o preço informado (`AUMENTOU/ABAIXOU/DIMINUIU PARA...`) e o **CB quando disponível**, sem criar informações ausentes. Se o aviso contiver apenas CI e preço, uma descrição/CB opcional pode ser preenchida por correspondência exata de CI com mensagens já sincronizadas do **mesmo grupo e de um tópico monitorado** (ex.: Cadastros), sem buscar em outros grupos ou tópicos não selecionados.

Registros de preços antigos erroneamente classificados como **Mensagens recebidas** também passam a ser reconhecidos pela leitura do relatório e pelo filtro de preços do Monitoramento. Os cartões de preços passam a interpretar o valor depois de `PARA` e a usar o último preço conhecido do mesmo grupo/tópico, sem inventar valor anterior.

Validação com mensagens fictícias equivalentes às imagens de 12/11: ULTRAFEST (7 itens), ART LATEX (1 item) e MAVALÉRIO (4 itens) = **12 CIs identificados**. A disponibilidade da informação real ainda depende de as mensagens terem sido sincronizadas da conta Telegram. A recuperação de históricos antigos deve ser feita em Telegram → Conexão e sincronização.

## Monitoramento compacto de preços e busca exclusiva

Em **Monitoramento → Mensagens recebidas → Alterações de preço**, os avisos agora aparecem em cartões compactos. Em cada produto, a mesma linha mostra CI, descrição e CB quando disponíveis, a direção da alteração e **Antes → Atual**, mantendo vermelho para aumento e verde para redução. A mensagem original continua recolhida em **Ver mensagem original**; o botão **Marcar como solicitação** e os dados de conferência não foram removidos.

Uma barra **Pesquisar preços** fica acima dos cartões desse filtro. A busca opera somente nos avisos já sincronizados do grupo/tópico exibido e aceita CI, descrição, CB ou marca. Quando um CI corresponde a um item de uma mensagem com vários produtos, somente a linha correspondente permanece visível; ao buscar pelo título da marca, todos os itens desse aviso podem aparecer. A contagem de avisos e produtos filtrados é exibida ao lado. **Limpar** restaura a lista.

No **Relatório TXT**, o antigo botão **Baixar relatório TXT** foi substituído por **Copiar relatório**. O clique gera o mesmo TXT simples por marca e CI a partir dos filtros atuais, copia o **conteúdo inteiro** para a área de transferência do navegador (com tentativa de compatibilidade em versões antigas) e mostra a prévia. Os botões para **Copiar CI** e **Copiar CB** individualmente continuam. A sincronização Telegram permanece sob demanda, sem mudanças de conteúdo ou históricos armazenados.


## Sincronização de grupos e tópicos entre computadores (conta Google)

A partir desta versão, a seção **Telegram → Conexão e sincronização** apresenta também um quadro **Configurações entre computadores** com o estado do Firebase. O projeto reaproveita o Firebase Authentication e Firestore que já protegem o Controle PDC (documentos por UID, nas permissões existentes `users/{uid}/...`).

**São sincronizados automaticamente na mesma conta Google do site:**
- Grupos de destino e tópicos associados a cada modelo de solicitação.
- Mapeamentos dos modelos para os destinos (inclusive Cadastro com NF-e).
- Rascunhos dos formulários de Telegram.
- Grupos/tópicos escolhidos para monitoramento e a data/hora de início de cada tópico.
- Renomeações e inclusão/remoção de vínculos, refletidos nos demais computadores com o site aberto.

Configurações estão em dois documentos distintos do Firestore, `users/{uid}/settings/telegramRouting` e `users/{uid}/settings/telegramMonitor`. Cada documento tem revisão numérica para evitar sobrescrita silenciosa entre computadores. Edições são enviadas com pequeno atraso para evitar uma escrita por tecla. O site importa uma configuração já salva ao entrar com a mesma conta Google e continua recebendo atualizações. Se o documento remoto ainda não existe, o primeiro PC que já tem grupos configurados o cria automaticamente após abrir a versão atualizada e fazer login Google. Por isso, para uma migração inicial, **abra primeiro a versão atualizada no PC original com a mesma conta Google** e confirme o status de sincronização; depois abra no novo PC.

**Não enviar à nuvem:** a senha local do Telegram, o número de autenticação, API ID/API hash, sessão MTProto e o histórico bruto de mensagens. Esses elementos continuam restritos ao dispositivo. O novo PC precisa autenticar ou desbloquear **a própria sessão Telegram**; depois pode clicar em **Sincronizar agora** para recuperar as mensagens disponíveis no Telegram desde as datas já restauradas. Como o histórico não foi copiado, os cursores de mensagens não são transferidos: isso evita pular mensagens que ainda não existem no segundo dispositivo. O Controle PDC principal já usa sincronização própria no Firebase e permanece intacto.

**Proteção contra alterações simultâneas:** cada documento de configuração registra uma revisão. Se outro PC tiver alterado os mesmos grupos/tópicos antes do salvamento, a edição local não será apagada automaticamente. O painel oferece **Restaurar da nuvem** ou **Manter e enviar deste PC** mediante confirmação. Antes de substituir uma configuração local pela remota, uma cópia de segurança local é preservada em `controle-pdc-telegram-config-backup-{uid}-{tipo}`. Configurações vinculadas a outra conta Telegram são bloqueadas quando a identidade Telegram conectada não coincide.

**Escopo de conta:** a sincronização depende de usar a **mesma conta Google** no site nos dois computadores, além da mesma conta Telegram para acessar os grupos. Não sincroniza dados entre contas Google diferentes, nem faz monitoramento 24 horas sem o site aberto.
