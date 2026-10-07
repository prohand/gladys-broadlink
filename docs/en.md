# Broadlink

Control your Broadlink devices **locally** from Gladys: no Broadlink account,
no cloud. The integration talks directly to the devices on your network (UDP,
port 80).

## Supported devices

| Family             | Models (examples)                                 | In Gladys                                    |
| ------------------ | ------------------------------------------------- | -------------------------------------------- |
| Universal remotes  | RM mini 3, RM pro / pro+, RM4 mini, RM4C, RM4 pro | One button per IR/RF code + temp. / humidity |
| Smart plugs        | SP1, SP2, SP mini, SP3, SP3S, SP4L, SP4M, MCB1…   | On/off (+ power on SP2S, SP3S, SP4B)         |
| Power strip        | MP1                                               | 4 switchable outlets                         |
| Environment sensor | A1                                                | Temperature, humidity                        |

- The temperature / humidity of an RM4 only shows up when its sensor cable
  (HTS2) is plugged in. The RM pro (RM2) has a built-in temperature sensor.
- Radio (RF 433/315 MHz) learning is only available on the **pro** models
  (RM pro, RM4 pro).

## Before you start

**Gladys 5.1.0 or newer** is required.

1. Set up your devices on your Wi-Fi with the **Broadlink** app.
2. In the app, open the settings of each device and **turn "Lock device"
   off**. A locked device refuses every local command: the integration
   ignores it.
3. Recommended: give each device a **fixed IP** (DHCP reservation on your
   router). Without one, when a device stops answering the integration scans
   the network again on its own (at most once every 10 minutes) to find its
   new address.

## Add the devices

1. Open the **Discovery** tab of the integration and run a **scan**.
2. Gladys sends a discovery request (UDP broadcast, port 80) on your local
   network; the devices found show up.
3. Add the ones you want.

Every device shows a **local** badge when it answers, or **unreachable**
when it stops answering (unplugged, IP changed…).

A device does not show up? It is probably on another network / VLAN, or the
broadcast is filtered. In the **Configuration** tab, type its IP address in
**Device IP addresses** (several addresses separated by commas), save, then
scan again.

## Remote codes (IR / RF)

Every code saved on an RM remote becomes a **button** of the device in
Gladys: turning it on sends the code, then it falls back to "off" by itself.
Use it on the dashboard and in scenes ("Control a device" action).

In scenes, the **"Send a Broadlink code"** action also sends a code by its
name (remote + code name, with an optional repeat count), without going
through a button.

The actions live in the **Configuration** tab:

- **Learn a remote code**
  - Pick the remote, give a name (e.g. "TV on"), then choose **Infrared** or
    **Radio**.
  - Infrared: click the button, then within 30 seconds press the key of your
    original remote, pointed at the Broadlink.
  - Radio: **hold** the key until the frequency is found (up to 30 s),
    release it, then press it **once** briefly.
- **Import a code**: paste an existing Broadlink code, in base64 (Home
  Assistant format, starts with `JgB`) or hexadecimal.
- **Send a code**: test a code by its name.
- **List saved codes** / **Delete a code**.
- **List found devices**: name, model, IP and MAC of every device (handy for
  troubleshooting).

After learning, importing or deleting a code, open the **Discovery** tab and
click **Update** on the remote so the button appears (or disappears).

Codes are stored in the data volume of the integration (`/data/codes.json`):
they survive updates.

## Settings

- **Device IP addresses**: only when the scan does not find a device.
- **Refresh interval**: how often plug states and sensors are read (60 s by
  default, 10 to 3600 s).

## Troubleshooting

- **A device is not found**: check it answers ping and sits on the same
  network as Gladys, or type its IP in the configuration.
- **"Authentication failed" / the device ignores commands**: the device is
  locked in the Broadlink app, unlock it.
- **An IR code is not captured**: bring the original remote closer
  (5–10 cm) and aim at the top of the Broadlink.
- **Logs**: read the integration logs from Gladys (or `docker logs`), with
  `LOG_LEVEL=debug` for details.
