Iată cum funcționează cele 3 „approval modes” în Codex CLI și cum se leagă (sau nu) de accesul la internet / web-search:

## Modurile de aprobare (ce face fiecare)

* **suggest** (implicit) – „read-only până aprobi tu”:
  Codex propune *diff-uri* și comenzi, dar **nu scrie și nu rulează** nimic fără acordul tău. Dacă îl combini cu `--quiet`, practic îl folosești ca „research mode” (îți dă rezultate/sugestii, fără să aplice). ([limitededitionjonathan.com][1], [blott.studio][2])
* **auto-edit** – editează fișiere **automat**, dar **cere aprobare** înainte de a rula comenzi în shell. Bun când vrei să accepți rapid modificările de cod, dar să păstrezi controlul pe execuții. ([limitededitionjonathan.com][1], [blott.studio][2])
* **full-auto** – autonomie maximă în limitele sandbox-ului Codex: poate **rula comenzi și aplica editări fără aprobare**. Important: rulează **fără acces la rețea** (network off) și izolat în directorul curent (git-aware). ([blott.studio][2], [Medium][3])

## Cine „poate accesa internetul” pentru web-search?

* **Niciun mod de aprobare, de unul singur, nu pornește internetul.**
  „Approval mode” controlează autonomia (editează/rulează vs. propune), **nu** accesul la rețea sau unelte externe. Accesul web se controlează separat, ca **tool** (Web Search) sau prin **setări de rețea** în cloud. ([OpenAI Developers][4])
* **Web-search ca tool**: îl poți activa **în orice mod** (suggest/auto-edit/full-auto).
  În CLI există flagul `--search` (și/sau setare în `config.toml`) care activează uneltele de căutare web ale modelului. Asta **nu** înseamnă „network on” pentru comenzi locale; este un tool pe partea modelului care aduce rezultate de căutare în răspuns. ([GitHub][5])
* **Network access (HTTP, curl, pip etc.)**:
  – **Local CLI**: implicit **dezactivat** în special în `full-auto`. ([blott.studio][2], [Medium][3])
  – **Codex Cloud**: poți ajusta accesul la internet (implicit off; configurabil per task). Setup-urile de build pot avea internet, apoi agentul rulează cu politica setată de tine. ([OpenAI Developers][6])

## Mape utile & exemple

* „**Research (default)**” ≈ `--approval-mode suggest --quiet`
  (nu aplică editări; livrează doar sugestii/rezultate). ([MachineLearningMastery.com][7])
* **Auto-edit**: `--approval-mode auto-edit`
* **Full-auto**: `--approval-mode full-auto`

### Web-search (separat de modurile de aprobare)

* One-off (validate pe v0.34.0):
  - Preferat: `codex -c tools.web_search=true -a untrusted -s read-only exec "…"`
  - Notă: `--search` nu funcționează în exec mode; folosește `-c tools.web_search=true` sau TOML.
* Permanent în config: în `~/.codex/config.toml` adaugă:

  ```toml
  [tools]
  web_search = true
  ```

  (activează nativ Web Search; în unele versiuni flagul `--search` e pentru TUI, iar cheia din TOML funcționează și pentru exec). ([GitHub][8])

**Concluzie:** alege modul de aprobare pentru **nivelul de autonomie**; pornește **Web Search** ca tool cu `-c tools.web_search=true` (sau TOML); pentru **internet real** (download/HTTP din shell), configurează explicit politica de rețea – de regulă în **Codex Cloud**. ([OpenAI Developers][4])

## Comenzi validate (rezultate reale)

- Sumar „iPhone Air” (2025‑09‑09), reasoning low, plain text, cu captură curată a ultimului mesaj:

```bash
outfile=/tmp/codex_last.txt
codex -c 'tools.web_search=true' -c 'approval_policy="on-failure"' \
  -s read-only -m gpt-5 exec \
  --output-last-message "$outfile" \
  "Use web search to summarize the iPhone Air announcement (2025-09-09).
   Output plain text (NO JSON). Include 1) one-line summary; 2) 3–6 key specs;
   3) pre-order and availability dates; 4) ≥2 sources with direct URLs, Apple first.
   Keep it concise and factual."
cat "$outfile"
```

- Observații:
  - În stream pot apărea WARN informative de tip `WebSearchCall ... response: None`; nu afectează rezultatul final.
  - `--output-last-message` este cea mai robustă metodă de colectare a mesajului final în exec.
  - Dacă nu apar evenimente de căutare: verificați profilul/mediul (Cloud internet ON) sau folosiți un MCP Web server local.

[1]: https://limitededitionjonathan.com/openai-codex-cli-a-comprehensive-overview/?utm_source=chatgpt.com "OpenAI Codex CLI: A Comprehensive Overview"
[2]: https://www.blott.studio/blog/post/openai-codex-cli-build-faster-code-right-from-your-terminal?utm_source=chatgpt.com "OpenAI Codex CLI: Build Faster Code Right From Your ..."
[3]: https://medium.com/%40PowerUpSkills/everything-you-need-to-know-about-openais-codex-cli-the-new-terminal-based-ai-coding-assistant-a66fe3dfe2a4?utm_source=chatgpt.com "Everything You Need to Know About OpenAI's Codex CLI"
[4]: https://developers.openai.com/tracks/building-agents/?utm_source=chatgpt.com "Building agents"
[5]: https://github.com/openai/codex/issues/3284?utm_source=chatgpt.com "BROKEN WEB SEARCH · Issue #3284 · openai/codex"
[6]: https://developers.openai.com/codex/cloud/internet-access/?utm_source=chatgpt.com "Agent internet access"
[7]: https://machinelearningmastery.com/understanding-openai-codex-cli-commands/?utm_source=chatgpt.com "Understanding OpenAI Codex CLI Commands"
[8]: https://github.com/openai/codex/issues/2760?utm_source=chatgpt.com "Updated Keys · Issue #2760 · openai/codex - Config.toml"
