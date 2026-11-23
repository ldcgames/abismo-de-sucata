# ABISMO DE SUCATA — status da v0.9 (22/11/2026)

## Novidades da v0.9.9

- O lixo atirado com o estilingue **fica onde caiu** (perto da árvore, no chão, no pé do amigo que levou o tiro) e dá para catar de novo. Só some se cair na água (ou acertar o Kraken/tubarão). Esse lixo não gera outro novo quando é catado, então a margem não enche demais.

## Novidades da v0.9.8

- Qualquer peixe pode ser cortado (até um lambari): o peixe cortado vale o dobro.
- **Cortar todos**: na bancada de peixe, com a mão vazia e peixes na mochila, **E** corta todos de uma vez (demora 10 s).
- **Restaurar todos**: botão na bancada de restauro que restaura tudo do submarino, do saco e do depósito (demora 10 s).
- **Vender tudo**: botão na aba Vender do computador com o valor total (peixes da mão e da mochila, saco de lixo e carga do submarino; peças da estátua ficam).
- Na frente do aquário/tanque, o E só mostra os peixes (colocar e pegar); comprar e equipar é só no computador.

## Novidades da v0.9.7

- **Só um aquário OU tanque na estação** (o equipado), entre a oficina e a placa com o nome. Comprar um novo já equipa e o anterior some. Os peixes passam para o novo; os que não couberem vão para a mochila.
- **Equipar** qualquer aquário ou tanque já comprado (aba Aquário e tanque no computador, ou E na frente dele). Dá para voltar para um aquário se não gostar do tanque.
- Tanques grandes crescem para trás, por cima da grama, com sapata de concreto. A placa da estação foi para perto da barraca da corrida, para o maior tanque caber inteiro.
- Os peixes de qualquer tamanho até o limite vão no tanque (o limite de 20 cm mínimo saiu). Tubarões só em tanque.
- Perfis antigos: o aquário e o tanque viram uma vitrine só (fica equipado o tanque, se tiver).

## Novidades da v0.9.6

- O peixe (ou tubarão) cortado na bancada agora vai **picado para a mão**: cabeça, rabo e filés.
- Na bancada, com o peixe cortado na mão: **E** guarda na mochila. Tubarão cortado também cabe na mochila (inteiro não).
- **Z** tira o próximo peixe da mochila para cortar. Corte vários e venda tudo junto.
- Novo botão **Vender todos os peixes** no computador (mão + mochila), com o total em S$.

## Novidades da v0.9.5

- **Recicladora saiu da loja** (componentes não são mais necessários; o HUD só mostra componentes se você ainda tiver algum).
- **Bancada de restauro — S$ 1.000**, agora com colisão. Restaurar é **grátis** e funciona com **qualquer item** (lixo, metal, sucata do lago) direto do submarino, da mochila de sucata ou do depósito. Item restaurado vende pelo **dobro**.
- **Bancada de peixe — S$ 2.000**, no lugar da antiga recicladora, com colisão. Com um peixe de **mais de 2 kg na mão**: **E** coloca na tábua, **I** corta (animação com faca), **I** pega o peixe cortado. Peixe cortado vende pelo **dobro**. Usar é grátis. Peixe cortado não entra no aquário.

## Novidades da v0.9.4
`peixe_vender` recusa peixe do aquário/tanque (tem que `aquario_retirar` antes); aba Vender e lista do aquário sem botão Vender para aquário/tanque; caixa térmica fora da interface (só aparece se ainda tiver peixe antigo); painel da mão ganhou botão Mochila. Testes: npm test 35/35 · e2e_solo 54/54.

## Novidades da v0.9.3
Melhorias do submarino com preço triplicado (`SUB_PRECO_MULT = 3` em data.js). Testes: npm test 35/35 · e2e_solo 54/54.

## Novidades da v0.9.2
Decorações com Equipar/Desequipar (`estacao.decoOff`). Tubarão do lago (TUBARAO em data.js: 200 de vida, um por vez, 20 min após morrer, ronda raio 42–54 m; carcaça boia; `tubarao_pegar`; derruba ao ser acertado; vende S$ 400 fixo). Dano de cada arma na loja; estilingue 1 de dano. Testes: npm test 35/35 · e2e_solo 54/54 · e2e_multi 36/36.

## Novidades da v0.9.1
Estação, depósito e extras só com dinheiro (sem componentes). 8 decorações de S$ 90–100 (vasos, flamingos, boias, banco, luzinhas, guarda-sol, churrasqueira, rede) com visual e colisão. Testes: npm test 33/33 · e2e_solo 50/50 · e2e_multi 36/36.

## Novidades da v0.9
Chat de voz por distância (M liga/desliga, WebRTC com sinalização pelo servidor, alcance 3× a base da estátua ≈ 69 m; mapa foi para J). Ranking top 3 de dinheiro no canto. 18 espécies de peixe e preços maiores; o dobro de peças no fundo, 100 lixos, tudo reaparece em segundos. Estilingue de lixo (S$ 400, 1ª arma; E cata para a mão, E guarda, Q mira com o arco do peixe, 1 s no chão). Queda mole ao ser acertado (armas de fogo empurram para longe). Breakdance. Kraken do abismo (a cada 20 min, 1 min, vida 3.000 balanceada pelo dano das armas, S$ 1.000 para todos). Corrida de submarino (barraca com troféus, convite Y/N, largada lado a lado, 5 palitos sobre a água, 200 ou 250 dividido, volta para onde estava).
Testes: npm test 32/32 · e2e_solo 50/50 · e2e_multi 36/36 (voz testada com microfone falso do Chrome: conexão e áudio chegando; o som real não dá para ouvir aqui).

## Novidades da v0.8
8 varas (bambu → lendária do abismo), 9 aquários (Nano grátis, Redondo S$ 40, de Mesa S$ 90… Panorâmico S$ 5.000; estilos redondo/plantado/corais) e 5 tanques de peixe evolutivos (Lona → Concreto → Concreto Duplo → Abissal → Oceânico), com visual próprio e colisão do tamanho real. Pode comprar qualquer vara/aquário melhor direto. Mochila guarda até 5 peixes (Z guarda/tira, G arremessa no amigo). No computador, a aba virou só "Vender": peixes da mão, mochila, caixa térmica, aquário e tanque (com Vender e Pegar na mão), lixo catado e carga do sub. Perfis antigos são convertidos (níveis antigos de vara/aquário/tanque mapeados para os novos).

## Novidades da v0.7
Funil contínuo da margem até a fenda (sem paredes nem frestas); câmera do sub presa na água navegável; colisão das pedras (a pé e sub) e do cais (sub); casinhas fechadas.
Observação: o teste e2e de pesca às vezes precisa de mais de uma tentativa (o peixe pode escapar no minijogo — é sorteio).

## Novidades da v0.6
Salas permanentes (código fixo, progresso por sala, lista com % de evolução, salvamento automático, testado com reinício do servidor); até 5 jogadores com estações vizinhas que só aparecem com jogador; cor e nome únicos; submarino só com dinheiro; missões rápidas; mais lixo e maior; marcador de queda do peixe; estátua maior.

## Novidades da v0.5
Barraca de armas (5 armas, munição, tiros derrubam 2–7 s e empurram, bazuca explode); estátua de 11 peças com multiplicador até 10× e final dourado; lixo catável na margem; fendas e bocas de caverna sem frestas; evolução do submarino 40% mais barata e visão melhor com faróis melhores.
Não testado ponta a ponta: tiro entre dois navegadores (testado nas regras do servidor e no cliente com evento simulado).

## Novidades da v0.4
Lago com metade da largura de novo (~150 m de diâmetro; fenda proporcional, ainda com 4.300 m de profundidade); 270 peças com qualidade crescendo com a profundidade (raso só lixo comum, rádios/hélices a partir de ~55–75 m, âncoras/sinos/cofres nos patamares da fenda, cristais e sondas abaixo de 1.400 m, relíquias na câmara); mira do arremesso com câmera por cima do ombro; roda de emotes no meio da tela; telhado da casinha refeito; placa explica para que serve a bolsa; tinta cobre ~85% da tela com aviso; encosta íngreme no limite do mapa onde o personagem escorrega sentado de volta, com parede invisível acima.

## Novidades da v0.3
Lago com metade da largura (mesma profundidade, 5 km no fundo da fenda); água clara no raso e escura só no fundo; mais sucata no fundo; medidor de profundidade com faixa segura/atenção/perigo para o casco atual; casco do sub sem transparência; faróis com cone suave, luz de preenchimento e mais força a cada nível; câmera do sub só de fora (perto/médio/longe com V); braço lançador com animação ao jogar a bolsa; garra pega, traz e guarda; limite de 5 objetos que sobe no computador; mochila (1 peixe, 10 bolsas, "Mochila cheia"); 1 bolsa inicial; casinha de fabricação com mesa e placa; 5 emotes na roda do mouse; vara só no píer/beira d'água; controles de celular removidos.

## Resultados dos testes (última execução)
| Comando | Resultado |
|---|---|
| `npm test` (regras + servidor WebSocket real) | **35/35** |
| `node tests/e2e_solo.mjs` (Chrome real) | **54/54** |
| `node tests/e2e_multi.mjs` (dois navegadores no mesmo servidor) | **36/36** |
| `node tools/tour.mjs` | 18 capturas de tela reais em `docs/capturas/` |

### O que os testes cobrem de verdade
- **Regras:** 4 jogadores por sala e o 5º recusado; reconexão volta à mesma vaga; venda tira 1 item e soma o valor; ação repetida com o mesmo id não duplica; coleta exige sub, alcance e capacidade, e o item some para todos; âncora gigante só com dois subs; aquário nano aceita 1 peixe ≤ 12 cm e recusa o 2º e os maiores; casco melhorado muda a profundidade máxima; vara fraca arrebenta com peixe grande e a melhor captura; lula → 2 balões → acerto no vidro → tinta continua por 10 min submerso → limpa só ao emergir; cooldown do balão; peixe = 3 s, tubarão = 7 s; alvo na água não é atingido; migração de perfil antigo.
- **Servidor real:** rota de saúde e arquivos; bloqueio de `../`; código de sala; sala cheia; snapshots com os 4; compra persistida em disco; reenvio da mesma compra não cobra de novo; queda e volta com o mesmo token; token errado não abre o perfil; token não é gravado em texto puro; pesca real + arremesso entre dois clientes com atordoamento de 3 s; correção de posição de quem tenta andar atordoado.
- **Navegador (solo):** andar; terminal e compra pelo botão; pesca completa (lançar, mordida, briga, peixe na mão); aquário; soltar; embarque; guindaste (sobe acima do cais, desce ao lado do cais, respingo); mergulho; não atravessar o fundo; garra recolhe sucata; gancho iça de volta com água escorrendo; venda; save após recarregar; mapa.
- **Navegador (multiplayer):** criar sala; link de convite preenche o código; estações diferentes; um vê o outro; pesca no servidor; caminhada sincronizada; "VOCÊ FOI ACERTADO POR UM PEIXE!" no outro navegador com 3 s parado; peixe sai do inventário; aviso some; "reconectando…"; volta na mesma estação com o perfil preservado.

### O que NÃO foi testado
- FPS em placa de vídeo real (o ambiente só tem renderização por software: 1–3 FPS).
- Áudio (ambiente sem som).
- Tinta de lula com dois navegadores (testada nas regras e na tela da cabine, não ponta a ponta).
- Tubarão no anzol dentro do jogo (só nas regras), contratos completos no navegador, deploy no Render/Fly (os arquivos estão prontos, mas não foram executados daqui).

## Próximo incremento de maior impacto
1. Medir FPS numa GPU real e ajustar os níveis de qualidade (LOD de árvores e sombras).
2. Tempestades e eventos (o parâmetro de tempestade já existe na água e no céu).
3. Login simples (código de recuperação) para levar o perfil online a outro aparelho.
4. Animação de esqueleto mais rica (mãos segurando o volante, saída do sub pela escotilha).
5. Simulação de movimento no servidor, se o jogo for aberto ao público.
