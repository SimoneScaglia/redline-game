# REDLINE

Un gioco di **intuito**. Web app client-side (solo HTML, CSS, JS — niente build, niente dipendenze).

> Leggi il motore del rivale. Punta il minimo che basta a batterlo.

## L'idea

Tu e il computer avete una macchina a testa. Il rivale ha una **potenza nascosta** `P` (360–460 CV)
e non te la dice. Durante lo *staging* il suo cruscotto si anima: spie, aghi, vibrazioni, fumo.
Tu guardi e basta — la fase di lettura è **passiva**. Poi scegli quanta potenza mettere nel tuo
motore (360–450 CV) e **vinci la gara se la tua potenza ≥ quella del rivale.**

Più tieni **bassa** la potenza, più gettoni vinci; se perdi, perdi quanto hai rischiato. Quindi il
gioco è uno solo: **punta il meno possibile che basta ancora a battere P.**

## Il trucco

Non tutte le spie dicono la verità. Alcune seguono davvero la potenza del rivale, altre sono solo
scena. Il gioco **non te lo dice**: capire a quali credere — e quanto — è tutto il gioco.
Le regole restano **costanti** di mano in mano (quindi imparabili), ma i valori sono **rumorosi**
ogni volta (quindi ogni lettura è nuova). Guardare più a lungo = più campioni da mediare.
Dopo ogni gara viene rivelata la **potenza reale** del rivale: è il feedback con cui migliori.

Il rivale può arrivare a 460 ma tu solo a 450: certe mani sono imbattibili. Riconoscerle e
**passare** fa parte del gioco.

## Economia (esiti in −100…+100 gettoni)

- Vinci (potenza ≥ rivale): **+(460 − potenza)** — motore più piccolo ⇒ premio più grande.
- Perdi: **−(potenza − 350)** — tanto ti sei spinto in alto, tanto rischi.
- Passi: **0**.

Puntando a caso il guadagno atteso è ≤ 0 (martellare "LANCIA" non paga); leggendo bene è nettamente
positivo. Quel divario è l'abilità.

## Difficoltà

**Facile / Medio / Difficile** cambiano *quante* spie del rivale sono bluff: più sali, più rumore
e più finte da smascherare. Gli indizi onesti restano gli stessi.

## Come si gioca

1. Apri il gioco (vedi sotto), scegli la difficoltà e premi **ACCENDI IL MOTORE**.
2. **Staging** (max 45s, passivo): osserva il cruscotto del rivale. Puoi premere *Sono pronto → Punta* quando vuoi.
3. **Puntata**: scegli la potenza del tuo motore col cursore. Oppure **PASSA**.
4. **Gara**: semaforo, lancio, drag race. Vinci se la tua potenza ≥ quella del rivale.
5. Guarda il responso, impara dalla potenza rivelata, prossima mano.

Scorciatoia: **Spazio** fa avanzare l'azione ovvia in ogni fase. Si gioca **a casse spente**: nessun
indizio passa dal suono (in v1 non c'è audio).

## Come eseguirlo

Tutto statico, niente da installare.

- **Doppio click** su `index.html`, **oppure**
- un server locale (consigliato):

```bash
python -m http.server 5178
```

poi apri <http://localhost:5178>.

## Struttura

```
index.html        markup + overlay UI
css/style.css     tema, layout, HUD, pannelli
js/rng.js         utilità matematiche + rumore gaussiano
js/model.js       potenza nascosta, tell, economia, difficoltà (il "cervello")
js/render.js      rendering canvas: motore, strumenti, fumo, albero, drag race
js/game.js        macchina a stati, tempistiche, input, loop principale
```

## Stato

Prototipo v1. Idee successive: modalità carriera con rivali dalle **personalità di bluff** diverse,
audio puramente atmosferico (mai come segnale), bonus "stile" per letture audaci e precise.
