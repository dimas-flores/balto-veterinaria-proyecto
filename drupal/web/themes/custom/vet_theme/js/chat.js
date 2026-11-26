/** Widget sin dependencias externas. El historial se limita a la pestaña actual. */
(function (Drupal, once, drupalSettings) {
  'use strict';
  Drupal.behaviors.baltoChat = {
    attach(context) {
      once('balto-chat', '.balto-chat', context).forEach((widget) => {
        const panel = widget.querySelector('.chat-panel');
        const launcher = widget.querySelector('.chat-launcher');
        const log = widget.querySelector('.chat-history');
        const form = widget.querySelector('.chat-form');
        const input = widget.querySelector('input');
        const typing = widget.querySelector('.chat-typing');
        const key = 'balto-chat-session-v1';
        const productKey = key + '-product';
        const validSku = value => typeof value === 'string' && /^[A-Z0-9][A-Z0-9-]{0,39}$/i.test(value);
        let history = [], busy = false, productSku = null, shoppingSpecies = '', shoppingCategory = '', shoppingAge = '', shoppingProduct = '', shoppingBudget = null;
        const rememberProduct = (value) => {
          productSku = validSku(value) ? value : null;
          try {
            if (productSku) sessionStorage.setItem(productKey, productSku);
            else sessionStorage.removeItem(productKey);
          } catch (_) { /* La memoria también funciona en la página actual. */ }
        };
        try {
          const savedSku = sessionStorage.getItem(productKey);
          if (validSku(savedSku)) productSku = savedSku;
          const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
          if (Array.isArray(stored)) history = stored.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string' && m.text.length <= 10000).slice(-40);
        } catch (_) { /* Navegar sin almacenamiento no impide usar el chat. */ }
        const save = () => {
          history = history.slice(-40);
          try { sessionStorage.setItem(key, JSON.stringify(history)); } catch (_) { /* Cuota o almacenamiento deshabilitado. */ }
        };
        const safeLink = (value) => {
          try {
            const url = new URL(value, window.location.origin);
            // Mismo sitio: fichas de producto, la tienda y la portada (con #servicios).
            if (url.origin === window.location.origin && /^\/(?:product\/\d+|tienda|user)?$/.test(url.pathname)) return url;
            if (url.protocol === 'tel:' && /^tel:\+?\d+$/.test(url.href)) return url;
            if (url.protocol === 'https:' && url.hostname === 'wa.me' && /^\/[0-9]+$/.test(url.pathname)) return url;
          } catch (_) { /* URL no válida. */ }
          return null;
        };
        const shopOptions = ['Alimentos', 'Accesorios', 'Higiene', 'Juguetes'];
        const initialPrompts = widget.querySelector('.chat-initial-prompts');
        const updateInitialPrompts = () => { initialPrompts.hidden = history.some(message => message.role === 'user'); };
        const optionsByIntent = {
          shopping_advice: shopOptions,
          categories: shopOptions,
          greeting: ['Separar cita', 'Precios de productos', 'Dónde atienden'],
          identity: ['Separar cita', 'Precios de productos', 'Dónde atienden'],
          product: ['Cómo comprar', 'Ver catálogo'],
          catalog: ['Alimentos para perro', 'Alimentos para gato'],
          category: ['Ver catálogo', 'Cómo comprar'],
          overview: ['Separar cita', 'Precios de productos'],
          pet_care: ['Separar cita'],
          services: ['Separar cita', 'Dónde atienden'],
          schedule: ['Separar cita'],
          purchase: ['Medios de pago'],
          payments: ['Cómo comprar'],
          parasite_care: ['Separar cita'],
        };
        const refinementOptions = {
          catalog: ['Menor precio', 'Solo disponibles', 'Cómo comprar'],
          species: ['Para perro', 'Para gato'],
          'cat-age': ['Es gatito', 'Es adulto'],
          'dog-age': ['Es cachorro', 'Es adulto'],
        };
        // El chat consulta la agenda y usa WhatsApp para solicitudes que requieren coordinación.
        const clinicPhone = '51986866036';
        const guidedSteps = {
          species: { key: 'mascota', ask: '¿Para qué mascota es la cita?', choices: ['Perro', 'Gato', 'Otra mascota'] },
          reason: { key: 'motivo', ask: '¿Cuál es el motivo?', choices: ['Consulta general', 'Vacunación', 'Cirugía', 'Hospitalización', 'Urgencia'] },
          day: { key: 'día', ask: '¿Qué día prefieres?', choices: ['Hoy', 'Mañana', 'Esta semana'] },
          time: { key: 'horario', ask: '¿En qué horario te queda mejor?', choices: ['Por la mañana', 'Por la tarde'] },
        };
        const guidedOrder = ['species', 'reason', 'day', 'time'];
        const guided = { step: '', data: {}, slots: [] };
        const validChoices = (value) => Array.isArray(value) && value.length <= 6 && value.every(c => typeof c === 'string' && c.length <= 40);
        const render = (message) => {
          const bubble = document.createElement('div');
          bubble.className = 'chat-message chat-message-' + message.role;
          const label = document.createElement('strong');
          label.className = 'visually-hidden';
          label.textContent = message.role === 'user' ? 'Tú: ' : 'BALTO: ';
          const text = document.createElement('p');
          text.textContent = message.text; // No interpretar HTML ni Markdown remoto.
          bubble.append(label, text);
          if (message.role === 'assistant' && Array.isArray(message.links)) {
            const links = document.createElement('div');
            links.className = 'chat-links';
            message.links.slice(0, 6).forEach((link) => {
              const url = link && safeLink(link.url);
              if (!url || typeof link.label !== 'string') return;
              const a = document.createElement('a');
              a.href = url.href; a.textContent = link.label.slice(0, 150);
              if (url.protocol === 'https:' && url.origin !== window.location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
              links.append(a);
            });
            bubble.append(links);
          }
          if (message.role === 'assistant' && message.intent && message === history[history.length - 1]) {
            const actions = document.createElement('div');
            actions.className = 'chat-prompts chat-follow-ups';
            const options = Object.hasOwn(refinementOptions, message.refineBy)
              ? refinementOptions[message.refineBy]
              : (Object.hasOwn(optionsByIntent, message.intent) ? optionsByIntent[message.intent] : []);
            options.forEach((option) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = option;
              button.addEventListener('click', () => {
                // Las sugerencias de una respuesta antigua ya no comparten su contexto.
                if (bubble === log.lastElementChild) send(option);
              });
              actions.append(button);
            });
            if (actions.childElementCount) bubble.append(actions);
          }
          if (message.role === 'assistant' && validChoices(message.choices) && message.choices.length && message === history[history.length - 1]) {
            const actions = document.createElement('div');
            actions.className = 'chat-prompts chat-follow-ups';
            message.choices.forEach((choice) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = choice;
              button.addEventListener('click', () => {
                if (bubble === log.lastElementChild) guidedAnswer(message.step, choice);
              });
              actions.append(button);
            });
            bubble.append(actions);
          }
          log.append(bubble);
          log.scrollTop = log.scrollHeight;
        };
        const add = (role, text, links = [], intent = '', refineBy = '', choices = [], step = '') => {
          const message = { role, text, links, intent, refineBy, choices, step };
          history.push(message); save(); render(message); updateInitialPrompts();
          while (log.children.length > 40) log.firstChild.remove();
        };
        const clearChoices = () => {
          const previous = log.lastElementChild?.querySelector('.chat-follow-ups');
          if (previous) previous.remove();
        };
        const askStep = (step) => {
          guided.step = step;
          add('assistant', guidedSteps[step].ask, [], '', '', [...guidedSteps[step].choices, 'Cancelar'], step);
        };
        const startGuided = () => {
          guided.data = {};
          askStep('species');
        };
        const finishGuided = () => {
          const d = guided.data;
          const text = 'Hola BALTO, quiero separar una cita para mi ' + d.mascota.toLowerCase() + ': ' + d.motivo.toLowerCase()
            + ', ' + d.día.toLowerCase() + ' ' + d.horario.toLowerCase() + '. ¿Qué horario tienen disponible?';
          const resumen = 'Este es el resumen de su solicitud de cita:\n• Mascota: ' + d.mascota + '\n• Motivo: ' + d.motivo
            + '\n• Día: ' + d.día + '\n• Horario: ' + d.horario + '\nEnvíe la solicitud por WhatsApp. BALTO le confirmará si hay disponibilidad.';
          guided.step = '';
          add('assistant', resumen, [{ label: 'Enviar por WhatsApp', url: 'https://wa.me/' + clinicPhone + '?text=' + encodeURIComponent(text) }], '', '', ['Empezar de nuevo', 'Horarios'], 'done');
        };
        const showSlots = async (day = '') => {
          guided.step = '';
          busy = true;
          try {
            const response = await fetch(day ? '/citas/turnos?day=' + day : '/citas/turnos', { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error('Agenda no disponible');
            const { slots } = await response.json();
            if (!slots.length) {
              if (day) {
                guided.slots = [];
                guided.step = 'slot';
                add('assistant', 'No hay turnos libres para ese día.', [], '', '', ['Ver próximos turnos', 'Cancelar'], 'slot');
                return;
              }
              add('assistant', 'La agenda no tiene turnos libres para los próximos días. Puede consultar otras fechas por WhatsApp.', [{label: 'Consultar por WhatsApp', url: 'https://wa.me/' + clinicPhone}]);
              return;
            }
            guided.slots = slots;
            guided.step = 'slot';
            add('assistant', 'Seleccione un turno disponible en la agenda de prueba.', [], '', '', [...slots.map(slot => slot.label), 'Cancelar'], 'slot');
          } catch (_) {
            add('assistant', 'La agenda no está disponible en este momento. Puede preparar su solicitud por WhatsApp.');
            askStep('day');
          } finally {
            busy = false;
          }
        };
        const reserveSlot = async (slot) => {
          guided.step = '';
          busy = true;
          const reference = Array.from(crypto.getRandomValues(new Uint8Array(18)), byte => byte.toString(16).padStart(2, '0')).join('');
          const request = {start: slot.start, reference, species: guided.data.mascota, reason: guided.data.motivo};
          try {
            const submit = () => fetch('/citas/reservar', {
              method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(request), signal: AbortSignal.timeout(5000),
            });
            const response = await submit().catch(submit);
            if (response.status === 409) {
              add('assistant', 'Ese turno ya fue reservado. Le muestro las opciones disponibles.');
              await showSlots();
              return;
            }
            if (response.status === 429) {
              const result = await response.json();
              add('assistant', result.error || 'Intente de nuevo en unos minutos.',
                [{label: 'Consultar por WhatsApp', url: 'https://wa.me/' + clinicPhone}]);
              return;
            }
            if (!response.ok) throw new Error('Reserva no disponible');
            const booking = await response.json();
            const message = 'Hola, BALTO. Quisiera confirmar mi cita del ' + booking.label
              + ' para ' + request.species.toLowerCase() + ' (' + request.reason.toLowerCase()
              + '). Mi referencia es ' + booking.reference + '.';
            const contact = 'https://wa.me/' + clinicPhone + '?text=' + encodeURIComponent(message);
            add('assistant', 'Turno registrado para el ' + booking.label + '. Referencia: ' + booking.reference
              + '. Envíe el resumen por WhatsApp para que BALTO confirme su cita.',
            [{ label: 'Confirmar por WhatsApp', url: contact }]);
          } catch (_) {
            add('assistant', 'No pude verificar si se registró el turno. Puede consultar con BALTO indicando esta referencia: ' + reference + '.', [{label: 'Consultar por WhatsApp', url: 'https://wa.me/' + clinicPhone}]);
          } finally {
            busy = false;
          }
        };
        const guidedAnswer = (step, choice) => {
          if (busy) return;
          clearChoices();
          if (choice === 'Cancelar') {
            guided.step = '';
            add('user', choice);
            add('assistant', 'La solicitud de cita se canceló.', [], 'general');
            return;
          }
          if (step === 'done') {
            if (choice === 'Empezar de nuevo') { add('user', choice); startGuided(); } else send(choice);
            return;
          }
          add('user', choice);
          if (step === 'slot' && guided.step === 'slot') {
            if (choice === 'Ver próximos turnos') { showSlots(); return; }
            const slot = guided.slots.find(option => option.label === choice);
            if (slot) reserveSlot(slot);
            return;
          }
          if (!Object.hasOwn(guidedSteps, step) || guided.step !== step) { startGuided(); return; }
          if (step === 'reason' && choice === 'Urgencia') {
            guided.step = '';
            add('assistant', 'Si es una urgencia, llama ahora a BALTO: 986 866036. Hospitalización las 24 horas.', [{ label: 'Llamar a BALTO', url: 'tel:+' + clinicPhone }], 'general');
            return;
          }
          guided.data[guidedSteps[step].key] = choice;
          if (step === 'reason' && ['Consulta general', 'Vacunación'].includes(choice)) {
            showSlots();
            return;
          }
          const next = guidedOrder[guidedOrder.indexOf(step) + 1];
          if (next) askStep(next); else finishGuided();
        };
        const welcome = () => add('assistant', '¡Hola! Soy el asistente de BALTO. Pregúntame por productos, disponibilidad, servicios u horarios.');
        history.forEach(render);
        updateInitialPrompts();
        if (!history.length) welcome();
        const closeButton = widget.querySelector('.chat-close');
        const mobilePanel = window.matchMedia('(max-width: 600px), (max-height: 500px) and (pointer: coarse)');
        const fitPanel = () => {
          const isMobileOpen = mobilePanel.matches && !panel.hidden;
          document.documentElement.classList.toggle('balto-chat-open', isMobileOpen);
          const viewport = window.visualViewport;
          if (!isMobileOpen || !viewport) return;
          panel.style.setProperty('--chat-viewport-height', viewport.height + 'px');
          panel.style.setProperty('--chat-viewport-top', viewport.offsetTop + 'px');
        };
        const open = (state) => {
          panel.hidden = !state;
          launcher.setAttribute('aria-expanded', String(state));
          fitPanel();
          if (state) {
            (mobilePanel.matches ? closeButton : input).focus({preventScroll: true});
            log.scrollTop = log.scrollHeight;
          } else {
            launcher.focus({preventScroll: true});
          }
        };
        mobilePanel.addEventListener('change', fitPanel);
        window.visualViewport?.addEventListener('resize', fitPanel);
        window.visualViewport?.addEventListener('scroll', fitPanel);
        launcher.addEventListener('click', () => open(panel.hidden));
        closeButton.addEventListener('click', () => open(false));
        widget.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) open(false); });
        const typedChoice = (step, message, choices) => {
          const text = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,]/g, '').trim();
          const direct = choices.find(choice => choice.localeCompare(message, 'es', {sensitivity: 'base'}) === 0);
          if (direct) return direct;
          if (/\b(?:cancel(?:ar|a|e|o)|salir|dejar de reservar)\b/.test(text)) return 'Cancelar';
          const patterns = {
            species: [[/\b(?:perro|perra|perrito|perrita|cachorro|cachorra)\b/, 'Perro'], [/\b(?:gato|gata|gatito|gatita)\b/, 'Gato'], [/\b(?:otra mascota|conejo|hamster|ave)\b/, 'Otra mascota']],
            reason: [[/\b(?:urgencia|emergencia|no respira|convulsiona|sangrado abundante)\b/, 'Urgencia'], [/\bvacun\w*/, 'Vacunación'], [/\b(?:consulta|revision|chequeo)\b/, 'Consulta general'], [/\b(?:cirugia|operacion|esterilizacion)\b/, 'Cirugía'], [/\bhospitaliza\w*/, 'Hospitalización']],
            day: [[/\bmanana\b/, 'Mañana'], [/\bhoy\b/, 'Hoy'], [/\besta semana\b/, 'Esta semana']],
            time: [[/\bmanana\b/, 'Por la mañana'], [/\btarde\b/, 'Por la tarde']],
          };
          if (step === 'slot') {
            const time = text.match(/\b(\d{1,2}):(\d{2})\b/);
            const matches = time ? choices.filter(choice => choice.endsWith(time[1].padStart(2, '0') + ':' + time[2])) : [];
            return matches.length === 1 ? matches[0] : '';
          }
          const matches = (patterns[step] || []).filter(([pattern]) => pattern.test(text));
          return matches.length === 1 ? matches[0][1] : '';
        };
        const send = async (value) => {
          const message = value.trim();
          if (busy || !message || message.length > 500) return;
          if (message === 'Separar cita') { clearChoices(); add('user', message); startGuided(); return; }
          if (guided.step === 'slot' || Object.hasOwn(guidedSteps, guided.step)) {
            const day = /^[¿¡\s]*(?:mejor\s+|para\s+|prefiero\s+)?(ma[nñ]ana|hoy)[?!.\s]*$/i.exec(message)?.[1]?.toLowerCase();
            if (guided.step === 'slot' && day && !/\d/.test(message)) {
              clearChoices();
              add('user', message);
              input.value = '';
              showSlots(day === 'hoy' ? 'today' : 'tomorrow');
              return;
            }
            const choices = guided.step === 'slot' && !guided.slots.length ? ['Ver próximos turnos'] : guided.step === 'slot' ? guided.slots.map(slot => slot.label) : guidedSteps[guided.step].choices;
            const options = [...choices, 'Cancelar'];
            const choice = typedChoice(guided.step, message, choices);
            input.value = '';
            if (choice) { guidedAnswer(guided.step, choice); return; }
            if (/\b(?:se (?:cayo|cayeron|ha caido)|cayo|cayeron|ha caido|se (?:tiro|lanzo)|salto)\b[^.!?;\n]{0,85}\b(?:pisos?|balcon|ventana|techo|azotea|altura|terraza|metros?)\b/.test(message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) || /\b(?:urgencia|emergencia|chocolate|veneno|temblando|atropell\w*|no respira|respira mal|se ahoga|no orina|no puede orinar|golpe de calor|uvas|pasas|cebolla|xilitol|lirio|anticongelante|ibuprofeno|paracetamol|diclofenaco|ivermectina|serpiente|convulsi\w*|sangrad\w*)\b/i.test(message)) {
              guided.step = '';
            } else {
              clearChoices();
              add('user', message);
              add('assistant', 'No pude identificar la opción. Puede escribir o tocar una de estas respuestas.', [], '', '', options, guided.step);
              return;
            }
          }
          guided.step = '';
          const previousActions = log.lastElementChild?.querySelector('.chat-follow-ups');
          if (previousActions) previousActions.remove();
          const conversation = history.filter(entry => !entry.step).slice(-4)
            .map(({ role, text, intent }) => ({ role, text: text.slice(0, 220), intent }));
          const clinicalFollowUp = history.at(-1)?.intent === 'clinical';
          busy = true; add('user', message); input.value = '';
          typing.hidden = false;
          form.querySelector('button').disabled = true;
          widget.querySelectorAll('.chat-prompts button').forEach(b => { b.disabled = true; });
          try {
            const url = new URL(drupalSettings.baltoChat?.webhookUrl);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Configuración no válida');
            // Si el proveedor tarda, pasa a las reglas sin esperar todo el límite de n8n.
            // Si falla, los reintentos usan las reglas y los datos de la tienda.
            const post = async (noAi, ms) => {
              const controller = new AbortController();
              const timer = window.setTimeout(() => controller.abort(), ms);
              try {
                const response = await fetch(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, productSku, shoppingSpecies, shoppingCategory, shoppingAge, shoppingProduct, shoppingBudget, clinicalFollowUp, conversation, noAi }), credentials: 'omit', signal: controller.signal });
                const result = await response.json();
                if (!response.ok || typeof result.reply !== 'string' || result.reply.length > 10000) throw new Error('Chat no disponible');
                return result;
              } finally { window.clearTimeout(timer); }
            };
            let data;
            try {
              data = await post(false, 15000);
            } catch (_) {
              await new Promise(resolve => window.setTimeout(resolve, 700));
              try {
                data = await post(true, 8000);
              } catch (_) {
                await new Promise(resolve => window.setTimeout(resolve, 1200));
                data = await post(true, 4000);
              }
            }
            if (Object.hasOwn(data, 'productSku')) {
              rememberProduct(data.productSku);
              shoppingProduct = typeof data.shoppingProduct === 'string' ? data.shoppingProduct.slice(0, 100) : '';
            }
            shoppingBudget = typeof data.shoppingBudget === 'number' ? data.shoppingBudget : null;
            shoppingAge = ['cachorro', 'gatito', 'adulto'].includes(data.shoppingAge) ? data.shoppingAge : '';
            shoppingCategory = ['alimentos', 'accesorios', 'higiene', 'juguetes'].includes(data.shoppingCategory) ? data.shoppingCategory : '';
            shoppingSpecies = ['perro', 'gato'].includes(data.shoppingSpecies) ? data.shoppingSpecies : '';
            if (data.intent === 'appointment') startGuided();
            else add('assistant', data.reply, data.links, data.intent, data.refineBy);
          } catch (_) {
            add('assistant', 'No pude conectar con el asistente. Si necesita atención, llame a BALTO al 986 866036.', [{ label: 'Llamar a BALTO', url: 'tel:+51986866036' }]);
          } finally {
            busy = false; typing.hidden = true;
            form.querySelector('button').disabled = false;
            widget.querySelectorAll('.chat-prompts button').forEach(b => { b.disabled = false; });
            if (!panel.hidden) input.focus();
          }
        };
        form.addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
        initialPrompts.querySelectorAll('button').forEach(button => button.addEventListener('click', () => send(button.dataset.message)));
        widget.querySelector('.chat-clear').addEventListener('click', () => {
          if (busy) return;
          rememberProduct(null);
          shoppingSpecies = '';
          shoppingCategory = '';
          shoppingAge = '';
          shoppingBudget = null;
          shoppingProduct = '';
          history = []; log.replaceChildren(); save(); welcome(); input.focus();
        });
      });
    },
  };
})(Drupal, once, drupalSettings);
