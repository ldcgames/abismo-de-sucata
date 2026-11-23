# Pipeline do personagem pescador (modelo Meshy AI → jogo)

1. `python3 ler.py` lê o `pescador.glb` original (837 mil vértices, texturas 4K) e salva malha + texturas.
2. `python3 decimar.py 0.022` reduz para ~37 mil triângulos (agrupamento por quádricas, sem rasgar as costuras de UV).
3. `python3 rig.py` monta o esqueleto (17 ossos, os mesmos do jogo), calcula os pesos da pele por distância geodésica na malha,
   prende a boia de pato no quadril e corta os triângulos que grudavam a boia nas mãos.
4. `python3 exportar.py` grava `client/src/entities/pescador_dados.js` (geometria compactada + textura 2048 em JPEG).
`ver.py` e `verlab.py` geram imagens de conferência (textura e ossos).
O `.glb` original (65 MB) não vai para o repositório.
