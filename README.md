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

## Física (com números de corridas reais)

**Vácuo e aerodinâmica**
- Colado atrás de outro carro: até **17% menos arrasto** (+~10 mph), sumindo por volta de 80 m.
- O da frente também ganha um pouco com o de trás, então **fila de 3 anda mais que dupla** e o
  pelotão é mais rápido que um carro sozinho. No superspeedway: sozinho ~181 mph, em pelotão ~190.
- **Vácuo lateral**: lado a lado, quem está um pouco atrás "rouba" ar e freia o da frente.
- **Ar sujo**: atrás de outro carro a frente perde pressão aerodinâmica nas curvas e o carro sai de
  frente (~0,2 s por volta em Charlotte). Quem lidera, em ar limpo, contorna melhor.
- Empurrão leve (bump draft) passa velocidade sem amassar; pancada forte amassa.
- Colado no vácuo a grade pega menos ar e a **temperatura da água sobe**.

**Pneus (cada roda separada)**
- Em oval só se vira à esquerda: o **dianteiro direito gasta e esquenta mais**, o traseiro esquerdo menos.
- Temperatura e **pressão** sobem com o uso (lado direito ganha ~15 psi numa sequência).
- **Pneu frio** saindo do box segura menos na primeira volta; superaquecido gasta mais rápido.
- Queda de tempo calibrada: Charlotte ~1 s no fim da sequência, Bristol ~1 s em 30 voltas,
  Martinsville ~1,2 s na sequência, superspeedway quase nada.
- Gasto até a lona o pneu **fura**; o dianteiro direito furado leva o carro para o muro.
- **2 pneus = só o lado direito**, como na NASCAR.
- Eixo da frente mais gasto que o de trás = sai de frente; traseira mais gasta = sai de traseira e pode rodar.

**Dano (três partes)**
- **Aerodinâmica** (lataria, bico, aerofólio): mais arrasto, menos pressão aerodinâmica.
- **Suspensão** (braço torto): carro anda de lado, perde aderência e **gasta pneu até 3× mais**.
- **Motor** (radiador amassado ao bater de frente): esquenta, perde potência e pode **quebrar**
  (e o óleo na pista causa bandeira amarela).
- No box só dá para **remendar** (fita e massa), como na regra de carro danificado; suspensão demora mais.
- O carro batido aparece mais sujo, inclinado e andando de lado.
- Tanque cheio pesa ~55 kg: o carro fica mais rápido conforme gasta gasolina.

## Som do motor

Sintetizado na hora (sem arquivos), a partir das referências do motor da Cup:

- **V8 de 5,86 L com virabrequim cruzado**, até ~9.800 rpm: 4 explosões por volta, então a nota
  fundamental é rpm ÷ 15 (≈ 600 Hz a 9.000 rpm).
- **Ordem de ignição 1‑8‑4‑3‑6‑5‑7‑2**: cada bancada solta pulsos com intervalos desiguais
  (180‑90‑180‑270°), o “tropeço” que dá o ronco de V8 americano. O jogo monta esses pulsos
  bancada por bancada, com pequenas diferenças entre cilindros e entre ciclos.
- **Ressonâncias fixas do escapamento** depois do gerador, para o timbre não afinar no giro alto.
- **Camadas como nos jogos de corrida**: escape, admissão (só com o pé embaixo), zunido do câmbio
  de dentes retos, vento, pneu cantando, raspada no muro, torcida.
- Tirando o pé: escape abafado e **estouros**; **corte na troca de marcha** e **limitador de giro**.
- **Cockpit** mais abafado e com mais mecânica; nas câmeras externas o som depende da distância.
- **Carros vizinhos** com **efeito Doppler**, estéreo e volume pela distância (o “vuuum” de quem passa).
- Batidas com pancada grave e chapa metálica.

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
| `js/carphys.js` | pneus por roda (desgaste, temperatura, pressão, furo), dano aero/suspensão/motor, reparos |
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
