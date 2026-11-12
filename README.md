# Nimbus — Xadrez às Cegas

Landing page com um chat onde você joga xadrez às cegas contra **Nimbus**, um adversário que muda de humor com o clima.

- Lances em notação algébrica pelo chat (`e4`, `Nf3`, `O-O`, `exd5`, `e8=Q`; também aceita `e2e4`).
- Segure o botão de olho (ou a tecla Espaço fora do campo de texto) para ver o tabuleiro.
- Comandos: `/ajuda`, `/novo`, `/pretas`, `/desfazer`, `/nivel 1-3`, `/lances`, `/pgn`.

## APIs públicas

- [Open-Meteo](https://open-meteo.com) — clima atual (São Paulo por padrão, ou sua localização). Muda as cores do site e as falas do Nimbus.
- [Stockfish Online](https://stockfish.online) — lances do adversário nos níveis 2 e 3. Se a API não responder, um motor local (`engine.js`) assume.
- [chess.js](https://github.com/jhlywa/chess.js) via jsDelivr — regras e validação dos lances.

## Rodar localmente

Site estático, sem build:

```bash
python -m http.server 5173
```

## Publicar

GitHub → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
