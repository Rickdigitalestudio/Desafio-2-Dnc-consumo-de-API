# DncWeather 3D · Estação Meteorológica Interativa

Site de previsão do tempo **totalmente interativo, dinâmico e em 3D**, evolução do desafio
“Consumo de API” (DNC). Além de consumir APIs, o projeto virou uma **estação meteorológica
completa**: cena 3D em tempo real da condição do clima, globo 3D com a localização,
gráficos da semana, medidores, qualidade do ar e análise inteligente.

🔗 [Site ao vivo no GitHub Pages](https://rickdigitalestudio.github.io/Desafio-2-Dnc-consumo-de-API/)

---

## ✨ O que tem na página

### 🌍 Cena 3D em tempo real (Three.js + WebGL)
- Ilha flutuante com casa, árvores, lago, pedras e uma **estação anemométrica** cujos
  cataventos giram conforme a velocidade do vento.
- **Sol, lua e estrelas** que aparecem conforme o horário local (`is_day` da API).
- **Nuvens** cuja quantidade/tom segue a cobertura de nuvens e o código WMO.
- **Chuva, neve, névoa e relâmpagos** com partículas reais e luz de flash nos raios.
- Céu com cores interpoladas por condição (limpo, nublado, chuva, tempestade, noite).
- Câmera orbital interativa: **arraste para girar, scroll para aproximar**, giro automático
  (liga/desliga) e botão para redefinir a câmera.
- **Modos visuais**: força a cena a mostrar Sol, Nuvens, Chuva, Neve, Névoa ou Tempestade
  para treinar/testar — mesmo com os dados reais carregados.

### 📍 Globo 3D com a localização
- Globo wireframe girando com **marcador pulsante** na coordenada pesquisada
  (CEP, cidade ou geolocalização), mais fuso horário, elevação e coordenadas.

### 📊 Dados e gráficos
- **Agora**: temperatura, sensação, umidade, vento, rajadas, direção do vento, pressão,
  cobertura de nuvens, precipitação, UV, visibilidade e horário local.
- **Medidores animados**: umidade do ar %, probabilidade de chuva %, índice UV e vento.
- **7 dias clicáveis**: ao clicar num dia, a cena 3D faz uma *prévia* daquele dia e todos
  os medidores, a análise e o gráfico de 24 h mudam junto.
- **Gráficos (Chart.js)**:
  1. Próximas 24 h — temperatura × % de chuva;
  2. Temperatura máxima e mínima da semana;
  3. **Umidade do ar % × Probabilidade de chuva %**;
  4. Chuva (mm) × Vento máximo;
  5. UV máximo × Temperatura média.
- **Detalhe do dia**: nascer/pôr do sol, UV, chuva do dia, vento, umidade média,
  **fase da lua** e nuvens.
- **Qualidade do ar**: índice europeu (EAQI), PM2.5, PM10 e ozônio.
- **Análise do dia**: texto gerado a partir dos dados + alertas (chuva forte, UV alto,
  vento, calor, frio, umidade, tempestade) com níveis de severidade.

### 🔎 Busca
- **CEP** (ViaCEP) + latitude/longitude — resolve o endereço completo;
- **Cidade** (geocoding Open-Meteo) com lista de resultados;
- **Usar minha localização** (geolocalização + reverse geocode);
- **Favoritos** salvos no `localStorage` (clique para recarregar, × para remover);
- **Unidades °C/°F** (tudo re-carrega convertido: °F, mph, mi, in);
- **Atualização automática a cada 10 min** + botão “Atualizar”.

---

## 🛠 Tecnologias e APIs

| Recurso | Fonte |
|---|---|
| Previsão atual/horária/diária (7 dias) | [Open-Meteo Forecast](https://open-meteo.com/) (sem chave) |
| Qualidade do ar | [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) |
| Busca de cidades | [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) |
| Endereço por CEP | [ViaCEP](https://viacep.com.br/) |
| Reverse geocode (localização) | BigDataCloud (sem chave) |
| Cena 3D e globo | **Three.js** (WebGL) via CDN/importmap |
| Gráficos | **Chart.js 4** |
| Ícones / tipografia | Font Awesome 6 · Oswald + Inter |

Estrutura de arquivos:

```
Desafio-2-Dnc-consumo-de-API/
├── index.html   # estrutura da página (seções, canvas, gráficos)
├── style.css    # visual (céu animado, vidro, medidores, responsivo)
├── index.js     # lógica: buscas, APIs, render, gráficos, favoritos
├── scene3d.js   # cena 3D (WeatherScene) e globo 3D (Globe3D)
└── README.md
```

---

## ▶️ Como rodar localmente

Os módulos ES precisam de servidor HTTP (não funciona abrindo o `file://` direto):

```bash
cd Desafio-2-Dnc-consumo-de-API
python -m http.server 8000
# abra http://localhost:8000
```

## 🚀 Como publicar no GitHub Pages

1. Coloque os arquivos na raiz do repositório `Desafio-2-Dnc-consumo-de-API`;
2. `git add . && git commit -m "DncWeather 3D" && git push`;
3. Em **Settings → Pages**, escolha *Deploy from a branch* → `main` / `/ (root)`;
4. O site fica em `https://<usuario>.github.io/Desafio-2-Dnc-consumo-de-API/`.

---

## 📌 Links do desafio

- **Demo (GitHub Pages)**: https://rickdigitalestudio.github.io/Desafio-2-Dnc-consumo-de-API/
- **Demo alternativa**: https://desafio2dnc.netlify.app
- **Planilha de registros**: [Google Sheets](https://docs.google.com/spreadsheets/d/19XyD3xdzsyZtb2hR8iyHG5QJbSLbvGOd3qULY58ZDBc/edit?gid=0#gid=0)

---

Feito por **Henrique Luiz Dutra** · Desafio 2 DNC — consumo de APIs.

## 📄 Licença

Este projeto está sob a licença MIT.
