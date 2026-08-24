# 🚀 Deploy do Servidor de Sinalização

## Opção 1: ngrok (mais rápido - 2 minutos)

1. Baixe o ngrok: https://ngrok.com/download
2. Instale e rode:

```bash
# Terminal 1 - Inicie o servidor
cd signaling-server
npm install
npm run dev

# Terminal 2 - Abra o túnel
ngrok http 3001
```

3. Copie a URL pública (ex: `https://abc123.ngrok-free.app`)
4. Use essa URL no app mobile

**⚠️ O ngrok gratuito muda a URL a cada reinício**

---

## Opção 2: Render.com (permanente e gratuito)

### Passo 1: Suba o código no GitHub

```bash
cd projeto_compartilhamento_tela
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SEU_USUARIO/screen-share.git
git push -u origin main
```

### Passo 2: Crie conta no Render
- Acesse: https://render.com
- Crie conta gratuita (sem cartão)

### Passo 3: Crie o serviço
1. Clique em "New+" → "Web Service"
2. Conecte seu repositório GitHub
3. Configure:
   - **Name**: `screen-share-signaling`
   - **Runtime**: Node
   - **Build Command**: `cd signaling-server && npm install && npx tsc`
   - **Start Command**: `cd signaling-server && node dist/index.js`
   - **Plan**: Free
4. Clique em "Create Web Service"

### Passo 4: Use a URL
O Render vai dar uma URL como: `https://screen-share-signaling.onrender.com`

Use essa URL no app mobile e desktop.

---

## 📱 Configurar o App Mobile

1. Abra o app no celular
2. No campo "Servidor", coloque a URL do deploy
3. Digite o código da sala
4. Conecte!

---

## 🖥️ Configurar o App Desktop

Edite `desktop/src/renderer.ts` e mude a URL padrão:

```typescript
const serverUrl = await (window as any).electronAPI.getServerUrl();
```

Ou defina a variável de ambiente:
```bash
set SIGNAL_SERVER_URL=https://screen-share-signaling.onrender.com
npm run dev
```
