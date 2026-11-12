# Nimbus — Xadrez às Cegas

Landing page com um chat onde você joga xadrez às cegas contra **Nimbus**, um adversário que muda de humor com o clima.

- Lances em notação algébrica pelo chat (`e4`, `Nf3`, `O-O`, `exd5`, `e8=Q`; também aceita `e2e4`).
- Segure o botão de olho (ou a tecla Espaço fora do campo de texto) para ver o tabuleiro.
- **Multijogador:** `/criar` abre uma sala e mostra um código + link; o amigo entra pelo link ou com `/entrar CÓDIGO`. Na sala, o que não for lance vira mensagem de chat. `/novo` faz revanche trocando as cores.
- Comandos: `/ajuda`, `/criar`, `/entrar`, `/nome`, `/sair`, `/novo`, `/pretas`, `/desistir`, `/desfazer`, `/nivel 1-3`, `/lances`, `/pgn`.

## APIs públicas

- [Open-Meteo](https://open-meteo.com) — clima atual (São Paulo por padrão, ou sua localização). Muda as cores do site e as falas do Nimbus.
- [Stockfish Online](https://stockfish.online) — lances do adversário nos níveis 2 e 3. Se a API não responder, um motor local (`engine.js`) assume.
- [PeerJS](https://peerjs.com) — salas online: o servidor público gratuito do PeerJS só apresenta os dois navegadores; os lances vão direto de um para o outro (WebRTC).
- [chess.js](https://github.com/jhlywa/chess.js) via jsDelivr — regras e validação dos lances.

## Rodar localmente

Site estático, sem build:

```bash
python -m http.server 5173
```

## Publicar

GitHub → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
