# Deploy do Servidor de Sinalização + TURN (coturn)

## Visão Geral

O problema original era que `openrelay.metered.ca` (servidor TURN gratuito) está **morto** — o domínio não resolve mais no DNS. Sem um servidor TURN funcionando, conexões entre redes diferentes (ex: espectador em outro estado) não funcionam.

**Solução:** Deploy do servidor de sinalização + coturn (TURN server) num servidor cloud.

## Arquitetura

```
┌─────────────────┐     WebSocket      ┌──────────────────────────────────┐
│  Desktop App    │ ──────────────────► │  Render (cloud)                  │
│  (host/source)  │                     │  ┌─────────────┐ ┌────────────┐ │
└─────────────────┘                     │  │ Signaling    │ │ coturn     │ │
                                        │  │ Server:3001  │ │ TURN:3478  │ │
┌─────────────────┐     WebSocket      │  │ (Node.js)    │ │ (UDP/TCP)  │ │
│  Celular App    │ ──────────────────► │  └─────────────┘ └────────────┘ │
│  (viewer)       │     WebRTC+TURN    └──────────────────────────────────┘
└─────────────────┘ ◄─────────────────►         ▲
                                    ICE/STUN/TURN
```

## Passo a passo

### 1. Criar conta no Render (grátis)
1. Acesse [render.com](https://render.com)
2. Crie uma conta gratuita
3. Conecte seu repositório GitHub

### 2. Preparar o repositório
```bash
# Adicione os novos arquivos ao git
cd signaling-server
git add Dockerfile start.sh coturn.conf render.yaml .dockerignore DEPLOY.md
git commit -m "Add cloud deployment with coturn TURN server"
git push
```

### 3. Criar o serviço no Render
1. No dashboard do Render, clique **New +** → **Web Service**
2. Conecte seu repositório GitHub
3. Configure:
   - **Name:** `screen-share-signaling`
   - **Runtime:** Docker
   - **Dockerfile:** `./Dockerfile` (na pasta signaling-server)
   - **Plan:** Free

4. Adicione as variáveis de ambiente:
   ```
   PORT=3001
   PUBLIC_IP=<IP_DO_SERV Render - aparece após o primeiro deploy>
   TURN_SECRET=<gerado automaticamente>
   TURN_USERNAME=screenshare
   TURN_CREDENTIAL=<gerado automaticamente>
   ```

5. Clique **Create Web Service**

### 4. Configurar o PUBLIC_IP
Após o primeiro deploy, o Render asigna um IP. Atualize a variável `PUBLIC_IP`:
1. No dashboard → seu serviço → **Environment**
2. Defina `PUBLIC_IP` para o IP do serviço (ex: `screen-share-signaling.onrender.com`)

### 5. Atualizar o Desktop App
No arquivo `desktop/src/ui/index.html`, o app já busca os ICE servers automaticamente do servidor. Certifique-se de que a URL do servidor está correta.

### 6. Atualizar o App Celular
No `join_screen.dart`, altere o IP do servidor para a URL do Render:
```
http://screen-share-signaling.onrender.com:3001
```

## Testar

1. Inicie o desktop app e crie uma sala
2. No celular, conecte com a URL do Render + código da sala
3. O WebRTC deve conectar via TURN relay (cross-network)

## Portas

| Porta | Protocolo | Uso |
|-------|-----------|-----|
| 3001 | TCP | Servidor de sinalização (WebSocket) |
| 3478 | UDP/TCP | STUN/TURN (coturn) |
| 5349 | TCP | TURNS (TLS) |

## Troubleshooting

### "Failed to resolve address for openrelay.metered.ca"
→ Este erro deve sumir após estas mudanças. Os servidores mortos foram removidos.

### WebRTC não conecta entre redes
→ Verifique se o coturn está rodando: `curl http://SEU-IP:3001/health`
→ Verifique se a porta 3478 está aberta no firewall

### Render timeout no free tier
→ O Render free tier hiberna após 15 min de inatividade. Na primeira conexão, pode demorar ~30s.
