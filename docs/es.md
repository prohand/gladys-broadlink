# Broadlink

Controle sus dispositivos Broadlink **en local** desde Gladys: sin cuenta
Broadlink ni nube. La integración se comunica directamente con los
dispositivos de su red (UDP, puerto 80).

## Dispositivos compatibles

| Familia               | Modelos (ejemplos)                                | En Gladys                                          |
| --------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Mandos universales    | RM mini 3, RM pro / pro+, RM4 mini, RM4C, RM4 pro | Un pulsador por código IR/RF + temp. / humedad     |
| Enchufes inteligentes | SP1, SP2, SP mini, SP3, SP3S, SP4L, SP4M, MCB1…   | Encendido/apagado (+ potencia en SP2S, SP3S, SP4B) |
| Regleta               | MP1                                               | 4 tomas controlables                               |
| Sensor ambiental      | A1                                                | Temperatura, humedad                               |

- La temperatura / humedad de un RM4 solo aparece cuando su cable de sensor
  (HTS2) está conectado. El RM pro (RM2) tiene un sensor de temperatura
  integrado.
- El aprendizaje de códigos de radio (RF 433/315 MHz) solo está disponible en
  los modelos **pro** (RM pro, RM4 pro).

## Antes de empezar

Se necesita **Gladys 5.1.0 o posterior**.

1. Configure sus dispositivos en su Wi-Fi con la app **Broadlink**.
2. En la app, abra los ajustes de cada dispositivo y **desactive «Bloquear
   dispositivo»**. Un dispositivo bloqueado rechaza cualquier orden local: la
   integración lo ignora.
3. Recomendado: asigne a cada dispositivo una **IP fija** (reserva DHCP en su
   router). Sin ella, cuando un dispositivo deja de responder, la integración
   vuelve a explorar la red por sí misma (como mucho una vez cada 10 minutos)
   para encontrar su nueva dirección.

## Añadir los dispositivos

1. Abra la pestaña **Descubrir** de la integración y pulse **Buscar**.
2. Gladys envía una petición de descubrimiento (broadcast UDP, puerto 80) en
   su red local; aparecen los dispositivos encontrados.
3. Pulse **Añadir a Gladys** en los que quiera.

Cada dispositivo muestra la insignia **Local** cuando responde, o
**Inaccesible** cuando deja de responder (desenchufado, IP cambiada…).

¿No aparece un dispositivo? Probablemente esté en otra red / VLAN, o el
broadcast esté filtrado. En la pestaña **Configuración**, escriba su dirección
IP en **Direcciones IP de los dispositivos** (varias direcciones separadas por
comas), guarde y vuelva a buscar.

## Códigos de mando (IR / RF)

Cada código guardado en un mando RM se convierte en un **pulsador** del
dispositivo en Gladys: cada pulsación envía el código una vez. Úselo en el
panel y en las escenas (acción «Establecer valor del dispositivo»).

> **Actualización desde la 1.2.0 o anterior**: los códigos se publicaban antes
> como interruptores de encendido/apagado, de modo que la acción de escena
> «Encender los interruptores» de Gladys y los asistentes de voz podían enviar
> cualquier código del mando (Vol+, por ejemplo). Abra la pestaña
> **Descubrir** y haga clic en **Actualizar** en cada mando: sus códigos se
> convierten en pulsadores. Conservan su identidad, así que los paneles y las
> escenas que los usan siguen funcionando.

En las escenas, la acción **«Enviar un código Broadlink»** también envía un
código por su nombre (mando + nombre del código, con un número de repeticiones
opcional), sin pasar por un pulsador.

Las acciones están en la pestaña **Configuración**:

- **Aprender un código de mando**
  - Elija el mando, escriba un nombre (p. ej. «Encender tele») y luego elija
    **Infrarrojo** o **Radio**.
  - Infrarrojo: haga clic en el botón y, en los 30 segundos siguientes, pulse
    la tecla de su mando original apuntando al Broadlink.
  - Radio: **mantenga** pulsada la tecla hasta que se encuentre la frecuencia
    (hasta 30 s), suéltela y luego púlsela **una vez** brevemente.
- **Importar un código**: pegue un código Broadlink existente, en base64
  (formato Home Assistant, empieza por `JgB`) o en hexadecimal.
- **Enviar un código**: pruebe un código por su nombre.
- **Listar los códigos guardados** / **Eliminar un código**.
- **Listar los dispositivos encontrados**: nombre, modelo, IP y MAC de cada
  dispositivo (útil para diagnosticar problemas).

Después de aprender, importar o eliminar un código, abra la pestaña
**Descubrir** y haga clic en **Actualizar** en el mando para que el pulsador
aparezca (o desaparezca).

Los códigos se guardan en el volumen de datos de la integración
(`/data/codes.json`): sobreviven a las actualizaciones.

## Ajustes

- **Direcciones IP de los dispositivos**: solo cuando la búsqueda no encuentra
  un dispositivo.
- **Intervalo de actualización**: cada cuánto se leen el estado de los
  enchufes y los sensores (60 s por defecto, de 10 a 3600 s). Gladys conserva
  el ritmo de sondeo con el que se **añadió** un dispositivo (cada 10, 15, 30 o
  60 s), y la integración no puede cambiarlo después. Aumentar el intervalo
  siempre se aplica; reducirlo **por debajo de 60 s** (o por debajo del valor
  vigente cuando se añadió el dispositivo) solo se aplica a los dispositivos
  añadidos después: elimine el dispositivo en Gladys y vuelva a añadirlo desde
  la pestaña **Descubrir** para aplicarlo.

## Solución de problemas

- **No se encuentra un dispositivo**: compruebe que responde al ping y que
  está en la misma red que Gladys, o escriba su IP en la configuración.
- **«Authentication failed» / el dispositivo ignora las órdenes**: el
  dispositivo está bloqueado en la app Broadlink, desbloquéelo.
- **No se captura un código IR**: acerque el mando original (5–10 cm) y
  apunte a la parte superior del Broadlink.
- **Registros**: consulte los registros de la integración en su pestaña **Registros** en Gladys (o
  `docker logs`), con `LOG_LEVEL=debug` para más detalles.
