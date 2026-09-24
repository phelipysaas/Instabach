# InstaBatch Studio

Aplicação web para **edição e composição de vídeos em lote**, criada para automatizar a preparação de vários vídeos a partir de um mesmo template visual.

O usuário seleciona um template (PNG/JPG), adiciona vários vídeos e configura a área de exibição. O InstaBatch processa os arquivos sequencialmente com **FFmpeg**, acompanha o progresso de cada item e gera os vídeos finais em MP4, com opção de download individual ou em ZIP.

> O processamento principal é local. A integração com Supabase é opcional e adiciona persistência de templates, histórico e armazenamento.

## Principais recursos

- Upload de um template e múltiplos vídeos
- Processamento de vídeos em fila
- Composição e renderização usando FFmpeg/FFprobe
- Ajuste do vídeo por `fit` ou `crop`
- Controle da posição e área ocupada pelo vídeo
- Template acima ou abaixo da camada de vídeo
- Preservação ou remoção do áudio
- Diferentes níveis de qualidade de renderização
- Acompanhamento do progresso de cada vídeo
- Cancelamento de processamento
- Download individual dos arquivos gerados
- Download dos resultados em arquivo ZIP
- Tratamento independente de erros: uma falha não interrompe toda a fila
- Integração opcional com Supabase para templates e histórico

## Tecnologias

**Frontend**
- React 18
- TypeScript
- Vite
- Tailwind CSS

**Backend / processamento**
- Node.js
- Express
- Multer
- FFmpeg / FFprobe
- Archiver

**Integração opcional**
- Supabase Database
- Supabase Storage

## Arquitetura resumida

```text
React + TypeScript
       |
       | HTTP / REST
       v
Node.js + Express
       |
       +---- Uploads (Multer)
       |
       +---- Fila de processamento
       |          |
       |          v
       |     FFmpeg / FFprobe
       |
       +---- Arquivos locais / ZIP
       |
       +---- Supabase (opcional)
```

## Requisitos

- Node.js 18 ou superior
- npm
- FFmpeg com FFprobe disponível no `PATH`

### Instalando FFmpeg no Windows

```bash
winget install Gyan.FFmpeg
```

Depois, feche e abra novamente o terminal e confirme:

```bash
ffmpeg -version
ffprobe -version
```

## Executando localmente

```bash
git clone https://github.com/phelipysaas/Instabach.git
cd Instabach
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001`

Para gerar o frontend e executar a aplicação pelo servidor Express:

```bash
npm start
```

Acesse `http://localhost:3001`.

## Supabase (opcional)

O processamento local não depende do Supabase. Caso queira utilizar os recursos de persistência, copie o arquivo de exemplo para `.env` e preencha:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Nunca envie o arquivo `.env` ou a Service Role Key para um repositório público.**

## Saída dos vídeos

Por padrão, os resultados são armazenados em:

```text
~/InstaBatch-Output/job-*
```

A renderização utiliza H.264/AAC em MP4 com `faststart`.

## Segurança

- Credenciais são carregadas por variáveis de ambiente.
- `.env` está ignorado pelo Git.
- A Service Role Key do Supabase deve permanecer exclusivamente no backend.
- Dependências (`node_modules`) e builds locais (`dist`) não são versionados.

## Objetivo do projeto

O InstaBatch nasceu para resolver um problema prático: reduzir o trabalho repetitivo de aplicar o mesmo layout a diversos vídeos destinados a redes sociais. Em vez de editar cada arquivo manualmente, a aplicação transforma a tarefa em um fluxo automatizado de processamento em lote.

## Autor

**Phelipy D Luka**  
Estudante de Análise e Desenvolvimento de Sistemas
