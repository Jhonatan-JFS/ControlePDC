# Telegram no Controle PDC — primeira integração de navegador

## Objetivo e alcance
A terceira aba **Telegram** é independente de **Controle PDC** e **Solicitações**. Permite configurar um destino real do Telegram, associar **mais de um modelo** a um mesmo grupo, preparar mensagem, confirmar envio e sincronizar mensagens **sob demanda**.

### Como conectar (sem bot, sem APK)
1. Entre no site publicado via Google, abra **Telegram → Configurações**.
2. Obtenha seu **API ID** e **API hash** pelo portal oficial https://my.telegram.org > API development tools, com sua própria conta. **Nunca compartilhe esses dados no chat.**
3. Digite API ID, API hash, número com DDI e uma **senha local de proteção** com pelo menos 12 caracteres. O Telegram poderá solicitar um código enviado a outro dispositivo, e a senha de duas etapas.
4. O site se comunica diretamente com os servidores Telegram pelo WebSocket MTProto usando a biblioteca `teleproto` e grava a sessão **cifrada por AES-GCM/PBKDF2 no armazenamento deste navegador**. A senha local não é enviada ao Telegram, não é incluída no GitHub e não é salva.
5. Em **Grupos e modelos**, adicione um nome de grupo, escolha um grupo real da conta e vincule. Marque, por exemplo, **Cadastro de Produto** e **Alteração de Nomenclatura** para o mesmo destino.
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
