# Oval 500 — Stock Car Racing 🏁

Jogo de corrida de stock car no estilo **NASCAR** para jogar no **celular** (e no computador),
direto do navegador e **offline** depois da primeira abertura.
Visual inspirado nos clássicos dos anos 90 (NASCAR Racing da Papyrus): cockpit com painel de
ponteiros, câmeras de TV com zoom, torcida de pixels coloridos e pelotão inteiro na pista.

Feito em HTML5 + [three.js](https://threejs.org) (incluído no repositório, sem internet).
Nenhum arquivo de imagem ou som: pista, carros, pinturas, painel e ronco do motor são gerados na hora.

---

## O que tem

- **4 ovais** com as medidas reais de comprimento e inclinação:
  | Pista | Inspirada em | Tamanho | Inclinação |
  |---|---|---|---|
  | Coastal Superspeedway | Daytona | 2,5 mi | curvas 31°, tri-oval 18°, reta 3° (placa restritora) |
  | Queen City Motor Speedway | Charlotte | 1,5 mi | curvas 24°, retas 5° |
  | Thunder Valley | Bristol | 0,533 mi | curvas 24–28°, box dando a volta nas curvas |
  | Old Dominion Paperclip | Martinsville | 0,526 mi | curvas 12°, retas planas |
- **20, 30 ou 40 carros** na pista, cada um com número, cores, patrocinador e montadora.
- **Física de oval**: aderência que depende da inclinação e da velocidade, carro que “sai de frente”
  e sobe para o muro, **vácuo** (quem vem atrás ganha velocidade, o da frente ganha empurrão),
  batidas de lado e de traseira, rodadas e dano.
- **Box completo**: pit road com limite de velocidade (55 mph / 40 mph nas curtas), uma vaga por
  carro com placa do número, **equipe de 5 pessoas** que pula o muro, macaco levantando o carro,
  e escolha de serviço: 4 pneus + gasolina, 2 pneus + gasolina ou só gasolina.
  Combustível e desgaste de pneu afetam a corrida; a IA também decide quando parar.
- **Bandeiras e procedimentos**: volta de apresentação atrás do carro-madrinha, bandeira verde,
  **amarela** com carro-madrinha e piloto automático, box aberto sob amarela,
  **relargada em fila dupla**, branca na última volta, quadriculada, **estágios** com pontos e
  prorrogação (overtime) se a amarela sair no fim.
- **Câmeras** (botão 🎥 ou tecla C):
  - **Cockpit** — santantônio, coluna, rede da janela, painel de alumínio com conta-giros até 10 mil,
    pressão e temperatura do óleo, temperatura da água (sobe no vácuo!), gasolina, velocímetro
    digital, câmbio em H e **retrovisor** funcionando.
  - **Perseguição** — atrás do carro, inclinando com a pista.
  - **TV** — câmeras fixas em torres no infield com zoom, trocando conforme o carro passa (“TV 3”).
  - **Helicóptero** — de cima e de lado, vendo o pelotão na curva.
- **Spotter** com voz (“carro por fora”, “por dentro”, “livre”, “bandeira amarela”…) e setas na tela.
- **Placar** P / L / número no estilo da TV, classificação ao vivo com intervalos, mapa da pista.
- **Campeonato** de 4 corridas com a pontuação da Cup Series: vitória 55, 2º 35, 3º 34… até 1 ponto;
  estágios 10 a 1 para os dez primeiros; +1 pela volta mais rápida. Fica salvo no aparelho.
- **Resultado** com posição de largada, voltas, voltas lideradas, melhor volta e pontos.

## Visual

- **Carros Next Gen moldados** em dezenas de seções curvas: arcos de roda, capô caído, traseira alta,
  cabine com vidros e colunas, aerofólio, splitter, retrovisores, rodas com aro e raios, escapamento lateral.
  Pintura inteira gerada por equipe (5 estilos de desenho), número na porta e no teto, patrocinador no
  capô, faróis adesivados, grade, rede da janela do piloto. Pintura com brilho e reflexo do céu.
  Versão mais leve do carro quando está longe da câmera (para rodar liso no celular).
- **Céu** em degradê com sol, nuvens e um dirigível dando voltas sobre a pista; cores com tone mapping.
- **Arquibancadas em degraus** com torcida pixelada (camisas, bonés, bandeiras), camarotes envidraçados,
  cobertura com pilares; muro SAFER com tubos e parafusos; placas de publicidade.
- **Torre-placar** no infield mostrando os 10 primeiros ao vivo; **carrinhos e guarda-sóis** de cada
  equipe no box; mecânicos em forma de gente (capacete, braços e pernas).
- **Grama cortada em faixas**, logotipo pintado no infield, **árvores**, **estacionamento lotado**,
  **motorhomes**, asfalto com emendas e manchas de borracha.
- **Efeitos**: fumaça de pneu nas rodadas e nas derrapagens, **faíscas** raspando no muro ou em outro
  carro, **marcas de pneu** que ficam no asfalto, fumaça de motor quando o carro está muito batido,
  burnout do vencedor.
- **HUD de transmissão**: placas inclinadas com degradê, classificação com as cores de cada carro,
  conta-giros em arco com luzes de troca de marcha, bandeira tremulando, mapa com o seu carro pulsando.
- **Cockpit**: painel de alumínio escovado com rebites, relógios com aro cromado e reflexo no vidro,
  velocímetro de LCD, chaves de ignição, santantônio com espuma, rede da janela, tremor com a
  velocidade e nas batidas.
- **Menu com corrida ao vivo** rodando no fundo, trocando de câmera.

## Controles

| Ação | Celular | Teclado |
|---|---|---|
| Virar | arraste o polegar na barra da esquerda (analógico) — ou incline o celular (Ajustes) | ← → / A D |
| Acelerar | pedal **GÁS** (mais embaixo = mais fundo) | ↑ / W |
| Frear | pedal **FREIO** | ↓ / S / espaço |
| Pedir box / cancelar | **BOX** | B |
| Trocar serviço do box | botão do serviço | V |
| Câmera | 🎥 | C |
| Pausa | ❚❚ | P / Esc |

Ajudas (em **Ajustes**, todas ligáveis/desligáveis):
- **Direção assistida** — o carro acompanha a curva sozinho; você só escolhe a faixa.
  Desligada, você segura o volante na curva como num simulador.
- **Freio assistido** — alivia e freia antes da curva se você chegar rápido demais.
- **Acelerador automático**, **inclinação do celular**, som, voz do spotter, km/h, estágios,
  combustível (proporcional à corrida / real / desligado) e qualidade gráfica.

## Como jogar no celular

### Publicar no GitHub Pages (recomendado)

1. No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
2. Em um ou dois minutos o jogo fica em `https://engericgarcia.github.io/Nascar-game/`.
3. Abra no celular e instale:
   - **Android (Chrome):** menu ⋮ → *Instalar aplicativo*
   - **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*
4. Depois disso abre em tela cheia e **funciona no modo avião**.

Jogue com o celular **deitado**.

### Rodar no computador

```bash
python3 -m http.server 8124
```

e abra `http://localhost:8124`. (Precisa de um servidor: o jogo usa módulos JavaScript, que o
navegador não carrega abrindo o arquivo direto.)

## Estrutura

| Arquivo | O que faz |
|---|---|
| `js/data.js` | pistas (medidas reais), grid de pilotos/equipes, pontuação |
| `js/track.js` | traçado do oval, inclinação, pit road e toda a pista 3D (asfalto, muro SAFER, alambrado, arquibancadas, pórtico da bandeira) |
| `js/cars.js` | modelo do stock car, pinturas, carro-madrinha e equipe de box |
| `js/sim.js` | física, vácuo, batidas, IA, box, bandeiras, estágios e resultado |
| `js/view.js` | cena 3D, câmeras (cockpit, perseguição, TV, helicóptero, retrovisor) e efeitos nos carros |
| `js/env.js` | céu, nuvens, reflexo do ambiente, dirigível, fumaça, faíscas e marcas de pneu |
| `js/scenery.js` | arquibancadas, torre-placar, box das equipes, árvores, estacionamento, motorhomes |
| `js/hud.js` | painel do cockpit e HUD |
| `js/input.js` | toque, inclinação e teclado |
| `js/audio.js` | motor V8 sintetizado, pelotão, pneus, batidas e voz do spotter |
| `js/main.js` | menus, campeonato e laço do jogo |
| `sw.js` | cache offline (suba `CACHE` ao publicar mudanças) |

Referências usadas: fichas técnicas das pistas (comprimento e inclinação) na Wikipedia e em
nascar.com, regras de box (5 pessoas por cima do muro, limite de 45–55 mph), relargada em fila dupla
e o sistema de pontos da Cup Series.

Os nomes de pistas, pilotos e patrocinadores são fictícios.
