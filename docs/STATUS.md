# ABISMO DE SUCATA — status da v0.8 (21/11/2026)

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
| `npm test` (regras + servidor WebSocket real) | **27/27** |
| `node tests/e2e_solo.mjs` (Chrome real) | **42/42** |
| `node tests/e2e_multi.mjs` (dois navegadores no mesmo servidor) | **23/23** |
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
