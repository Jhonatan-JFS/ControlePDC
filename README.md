# Controle PDC — v1.0 (protótipo funcional)

Organizador pessoal para acompanhar **atualizações de produtos**, cargas enviadas manualmente ao **PDC** e confirmação manual de impressão de etiquetas. Não acessa Telegram, PDC ou impressoras.

## Testar sem instalar programas

1. No GitHub, abra **Code → Download ZIP**.
2. Extraia a pasta mantendo os arquivos index.html, style.css e app.js juntos.
3. Abra index.html no Chrome, Edge, Firefox ou outro navegador moderno.
4. Expanda **Entrada de mensagens**, cole uma lista e clique em **Analisar mensagem**.
5. Revise a prévia e salve os itens selecionados.

O botão **Inserir exemplo** fornece dados fictícios para os primeiros testes.

> **Importante:** esta etapa usa armazenamento **local do navegador**. O GitHub guarda o código do site, não as tarefas. Os registros ainda **não sincronizam entre computador e celular**; a conexão com Firebase será feita em uma fase posterior. Use **Backup → Restaurar** para transferir os dados manualmente enquanto isso.

## Modelo de texto

O parser reconhece cabeçalhos de categoria e de família/marca, mantendo a ordem de cada linha:

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

**Regras principais:**

- A categoria indicada no cabeçalho vale para as linhas seguintes; a categoria escrita na própria linha tem prioridade.
- Uma linha como Kit ou São Roque vira família/marca até surgir outro cabeçalho de família.
- Cabeçalhos repetidos em mensagens diferentes não são mesclados automaticamente.
- CI, CB, nome, preço e validade são reconhecidos quando disponíveis. Dados ausentes permanecem em branco.
- Preços aceitam 2.50, 2,50 e R$ 2,50.
- Validade aceita 15112026, 15/11/2026 e formatos semelhantes.
- Linhas que não forem identificadas aparecem na prévia e permanecem no texto original do lote.
- CI repetido gera alerta, mas nenhum registro é excluído ou substituído automaticamente.

## Fluxo operacional

- **Pendente de Carga** → ao clicar na seta, **Carga Enviada**.
- **Carga Enviada** → ao clicar no visto, **Impressão confirmada**.
- Itens não impressos permanecem na mesma ala em dias seguintes, com marcador laranja.
- Itens impressos ficam visíveis no dia da confirmação e seguem consultáveis pelo calendário.
- Cada ação de status recebe registro de data/hora para reconstruir o histórico de qualquer dia.
- Seleção em lote, filtros rápidos, observações, edição e **Desfazer** estão incluídos.

## Privacidade e backup

- Os dados são salvos em localStorage neste navegador.
- A exclusão de dados do navegador pode apagar os registros locais. Exporte backups JSON periodicamente.
- O modo anônimo/privado não é adequado para uso contínuo.
- O backup contém produtos, eventos e textos originais colados: guarde o arquivo em local seguro.
- Não há telemetria, API de IA ou integração com terceiros nesta versão. A folha de estilos pode baixar fontes web quando houver conexão; sem internet, usa fontes de substituição.
- O site não altera configuração de rede, PDVs ou impressoras.

## Próxima etapa planejada

Hospedagem via **GitHub Pages** e sincronização **Firebase Authentication + Cloud Firestore**. Antes de publicar o repositório, configurar login com conta autorizada, regras de segurança restritas ao usuário e testes de acesso negado. **Nunca** enviar chaves administrativas do Firebase ou conteúdo de trabalho ao repositório público.

Este repositório permanece privado durante a primeira etapa de testes.
