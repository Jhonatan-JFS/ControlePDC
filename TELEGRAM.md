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
