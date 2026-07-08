FROM node:20

# Instalar Chromium en lugar de Chrome para que sea compatible con NAS ARM y AMD64
RUN apt-get update \
    && apt-get install -y chromium fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de la app
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias de Node
RUN npm install

# Copiar el resto del código (omitiendo lo que está en .dockerignore)
COPY . .

# Exponer el puerto (Render usa el puerto automáticamente, pero por convención ponemos 3000)
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "server.js"]
