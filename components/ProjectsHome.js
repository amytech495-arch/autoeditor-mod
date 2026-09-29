"use client";
import { useState } from "react";
import { showConfirm, showPrompt } from "./Dialog";

function fmtBytes(n) {
  if (!n) return "0 MB";
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(ts).toLocaleDateString();
}
function clock(sec) {
  if (!sec || !isFinite(sec)) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
// Owner photo (embedded so the repo stays binary-free).
const OWNER_PIC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCACAAIADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDsvCiaRc2o0u/sLbzkyUeUAmYkk4HGcj0rQuPBfh2YELZeUev7qVh+hJqLw3YrLrdtuQMFYvyPQGuh8WwBdJ2RgxO7fKTzjA646elTRalD3lsdOIvCp7r3OFn+H9hcNI1pezRoMBd6bu3PoayL34d6kgJt5rWcemSh/Wu0iu9Ut3+ztf6VcTKATFIpikx2+639KsjU7+P/AI+tFmI/vW86yD8mwaVqbJVWqjyS+8H6zb58zTJyB3Qbx+lYl1pbRsVliaM+jqR/Ovdxr2lhsTyS2jelzA8f64I/WrSPYagmI5bW7U9ldJP0zn9KTop7MtYqS+JHzjNpoI+7VKbTP9mvou+8LaFcZ87TYY2PdQYz/SsS9+HelS5a3uLmD64cfrUujNbGixMHueCS6aw6Cq0li6n7tez33w3vVJNtd20w7BgUP9awb7wRrkGd2nPIB3iIf+VQ4zW6NVUpy2Z5c9q47VE0JHau4vNFngYrPbSxEdnQj+dZ8umA/wANLmLsjlDGR2ppT2roptL9qqyacw6Cmpi5TF24PFNeNHBDorfUVqSWTjtVd7dh/CatTJcT6+8FW+/UZpMf6uLH4k//AFq0fFi7rm3gHQDJ/E//AFqn8C2+La4mx96QKPoB/wDXpmuYfW2z92MAH8B/9etKelE4q7vWZ4N431Qf8JzqI8mKYQSrGgkXcAVQAn880/TdTurTw1qGoQ3U8LieGCPZIQFYks2B0HAx071zt9Ok2rahdXDMs1xcvIAR0DMeSOvQitq9tWXwZpdvDPA7Xd9NcZ3bQ4ULGuM987q3tHlSZ47lL2kpJ9zQ0Pxprb3EdtcXEVy0jqiLJbg5JOMEqR+dek3Gi6fNu82ygZ2cDcEAPHuOa8n8CaPeSeN9MjuLdgkU3mSHIIG1S3OPcCvatRkW006a6fgQwyTH8AT/AErGtGKfunZg5zlFuTucJFr+gRzSQW/iDVNOaNyhDM5jyDjjIYYrYsb/AFCZBJYa1pepxk4XfEFYkdtyEc/hXjFszNDvk++3zH8etauvBrfQtDsVGZHge6fjJHmSHB/75Rat0mrJMzjjOa94nrn9q6rCcXWhs4/vW1wG/wDHXAP61IuvaaADc/abPP8Az8W7KPzGRXj/AIb1zUtHvknlubu6t0Df6L57FGOCBnOQADzx6VcvPiJ4neTEVlZRRA8KYSxxn1Jp8lVM6YyjNXtY9chvNMvhthvLS4z/AArKpP5HB/Sq194a0e5ybjTLfJ/i8vYfzGK4jRPEen66vlX2h2xuQuWUMFLepXI/TNa2dJtHPlXWqaWwCksjvsGQDjjI71Dk1pKI1OKekrEl94B0SVWeIzQADOVk3AfnmsW9+GjOu+x1OGVT08xMZ/EZro7K61GYltP8RW2oBRkrNCjkfUrgj8a6PQodQl01ZrpomdmJ2oSFUegyDUpQn0Nfa1Iq9zxu++H+vQ5Is0mH/TKQH9Dg1zE+llWKsmGBwR717D4u1rVY76bTtOCWwgkAa4GGZuPmXGMYyevXiuK/s3YMEZrnqOKdondR9pJXkfSnhC38vRIDjmQs5/E//WrkfGN8bLS9c1XdgwW0rqc9Dg4/XFd/axi00lF6eVAPzArxv423osPhlqbk4a6ljgHvlgT+imuqStFRPNlK8pSPGH+I/iBHWG9ubLUY1XawvbVJu3qRu/Wu41bXNIh1LQtMvPDyPPHZW8q/ZJ2iWF5QXICkEYG4Hn1rwjS4ZdV1a3tFB33VwkK+vzMF/rXUfFm/Nx8SNa+zORFBc/Zo9vZYlEY/9BpPc49eV3PefAEOiXGu3d7pXmiURbptyqQSTgHep5PXjAroPiDDdyeFNRtbFFe5mhEEatIqAliMjLEDpmuM/ZltGfwzqF+xyJ7xYkPsi5P6sav/ALQMrS6Fp2kxrukvr0tjzNgCxoSWZv4VGck9gM1Lu5G9OPLSPM9R0nUrC5js73TLyK5uTi3hEZLzHvtAzux7VDrHiPQtGv4pPFGq29xPbokR0uyjFw4VFwqSMrKiY9N5Oeorzzxd46NraSaD4XupltNpjudRLETXg7qpPMcPoowW6tnoPOJJyx4rsWi1IpUlDY94/wCFteCPtrTP4OvrgMVzvuIkXgAcRquBnGSM8kn1rb8N+Kvhbr0kVrMk+mzM0Kn7VK0BIVzvxIGaPcynHzBBlR0ya+ag7+hqWOd0PORRoban29o/g/Q3077EBJcwpceZAJG8u4WSaN0WMuoxgvHEysflIf61zeoXF1pep3OlX1y8qygTQzSjDEMONwPTpgjswNeG/DH4mXvh64tLLUXmu9JhmWSIDBls3DBg8WeMAjJjPyt7Hmu68SahfC7tri5vY9QtZLcNY3UQxHNBuJBX05LAg8g5BqYwd730M6tONWPKz0n4a2ubbVdQKbTJIsC/QDJ/V/0r1W2t0hsY2dQBGm4n04ya84+DF3b6p4citYRhorxhJzkndhgfyOP+A16V4pf7PoN0ynDOvlr9WOP5ZrFe65SZVOFoxpo8vmjaeSS4cfNK5c/ic1VktR6VtNHxjHFRtED2rzL3PfSse2a0RHpkx9Rj9a8C/aE8TDw7oWk2507TdRF1JI8kF9D5iFVA5AyCDluor3fxQxFgIx1Y/wCf518mftYX3m+MrLTQSUtLAbgOxdi38gK9OeskeBtFlX4W6t4O1zxtp7N4LTTLy2ZrwT2d8/kr5KmQlo3zx8vQGse4sPAet3k95a+L9Q06e4kaVl1PTty7mOT88RPHPpVX4Ww/2fofjHXQQWtdFeCFh/fuHWMfjjdXGwoxdIYdzu5CKMevA/U1D3M3sfZPwa0WPRPh/p1rFdQXisJLj7RBny5d7EhlyAcYx1FeV/tc3N/Bp0X2eCcQLCkDzBDsxI7F1DYxk+XGCPQ47177oOnrpmhWenoMLbW0UAA/2VAP8q+T/wBofXbzUvG+u6ct3cGwiuUjEHmHyy0ahc7emc55op/Fc3fuqx4RskmbocVdstMeVgNp/KvVtR8H6ZZ6dG8ibJY4gDjucc5/GqmgWOi3E/lLeRpIOqvxzU1MQ2vdR6NLCxT99nFxeH5SBiPJqC+0WSLOYyK93sdC02OFS4VyejKKxPFOgph3hjytcyryXU7HhoNWseEzQtC/HFeg/CzXkuom8HapMFtbuQvYSSHi2uzwOeyScI3vtbtWFremOkh+Q5HtXPSRSQSbgGGDzXoUa3MjysRQdNn2T+y/ZPFZasJEZHiu8MrDDKQmMH3BzXpXjyXFta2o/jkLn6KMD9TXCfst6gdX8M3uqTA/abswyTt/fcBo3b8THuPuxrr/ABhJ52teWOkMSr+J5P8AMVGKfLF26kYWPNVXkYBTNNMdWSmKCteWeweqeIYpbkxeQBIoOW7V5z42+FHhbxZfSX+rWN2t7IAGuILggnAwOORwPatCHV5oT82n3cPvaXe4f98tirsHiaJT+81GSI+l7Zkf+PLxXp80JO6keK6U4qziedT/AAPtrTwdqfh7RNbkhGoXMMzyXcWSFi3YT5cZBLZz7Vxeg/AXxTpni7Sbq7l06806G9jknkhmIbYrAn5WA9O1fR1nrYuQBGtleD/p2ugT/wB8mrYvbNT+/trq292hJH5rRyS6GdokUpEMDTSfdTdI30Ar5G8P6d/bt/qN9qtpC63k7TguMTCQyFlC57AA7h7ivsSF9PnCrBexPgYC7xn8jXh/iS1F347v7iQKjtO6qc9AGx+qqtc9ZyhHQ78DTjUqNvojzPxLdy6XqrvfaZcTKVLLsQFTjngkiuL1HUdC1iZbvTbOaKbPzlkIBPXH1/GvdPFulWl1HiYxPGB94ybCv41xUfhuwMyGOVijNkEuzZ+hx+tcfPGK13PZVGc2mtihow1JdPWQWrtEBneeazfEOqXjMIrWUK5H3cEnNehjTUig2RMVH3QMdK868Q+Hrlb24uUNwGcHypYx91uxx3A9BWdJqUtTavBxhoZcVprM5D6haQ7ARkhfmx64qbxlpOmJ4duLuG3RVwqJ8uDvJ/8A11f0CDxY0awyTW19zzkbGA9sjn8hj3rd13RreSxtf7amEVnazrPdRgMzyr02DH1Iyema7YStNLp5HnTpuVN2Tv5nrf7LGhz6P8JLBrlWSS/mkuwrdo2IVPzC5/Gti9f7RfXFwefMlYj6Z4/Suugkgg8NpcW0YihW0VokAxtBQbRjtjIFckqYQD0FbYuV7I87BRs2yApTStWStNZa4rHoXL4NP2rt7VXYTRSEyROB9Kj89g5OOO2afMhcrHzWFlNzLbRMfUqM0tvBLbf8ed9e23sk7bfyORTXuum1frmnSXIUDb3GaalbZg4X3RYN5qo4luLW7X0ubVSfzXFeUfEm9fT/ABBJ9nhSJpUEjJG5ZQx54zyB7c4r01bmNs7jivJPinJs8XTA9BHG6/Tbj+lE5ymrNl0KcYTulYwLl9Rv71IL29jgUqH8gYZsHu2eg9qkPiLX9Evf3rwalZA4UGP50HoD6e1Zsmh6xJdJrOm3MTT3GBJHMOMDjg9jXTW2g+Kbi3J+0aRdhIHnkgkIjdUUgYww6nkgDsKUaSaO2VZx+J2Jv+FjaPJblLiIM+CFiWJt38qzp/ElgbOO5tNPvBGJD50M68FD1Ye49aig0y8bQrfXJPCcx064RpEnjBOVU8nGSQPqKpalrumx20lpFchLhD/qHH71D9AP6UnQt0KVddGjv/Ds2lXUAuLd2ZCudj8hffNV9O0U+I/F9vpcm5rW4kCzhehRWDEfkprhtBupobVJwhgWdDuReArAkEgdgeuO1eofCqZbJG1WaXyZCHW3zbvJnoGwRwOmOtFKHvJMwxNXlg5Lc9Y8VYg0dYUGwSOqbcYwBzj9BXLYxU914svL1TbPpkcsfIErsVxkdQpGQQex9KroxK8jmuivJSldM8vDQcIWaFIppFPo4rGx0XObT4jGyn8jVtHuLdsKd8T5UgjPG4Ad+ea2LTxv4XvNomuRAzAEC6t2Tg9Duxj9a8xWXNndG1hFpbvIqsEEkZGMsBuiLrjjk4HaneYjT3LKs+pwDakUpWKbZzwflKScqCACOKqWEg9tGZKTTvfQ9ktf7I1BN9nPDMD3gmD/AONOl0mMj5JsH0ZcfyryOHTbTUL6aCK2mN/EFVI7VZI5CcgHO5T25zu5rprHw38SInB0m51a3iRFBh1BVYM3fBLN/Ss1hKnR/eXKuoK97nWPpVwvKqrj/ZOa4j4o+Gbm+tV1SGBxPboVkXbgsnX8xz+Brv8Aw1o3j+R4xrLaHHEFG9vmMme+Ahx+eK66bQf3WUv3XCndlODx9aaw9eL2J+uQPmjQkFzpvkq+1l5U+hp80+uWibXsIbqMchlY8/hyP5Vj63eXGizi9jwYXkIkVRgqQcEn61o6R4rtrkbZCpyAeDVzpyps9PDYmMtOpftNcv7iH7KbK7iQjBjZ8x4+n/1qbfQwxq08kcQlYfKFQA1Mde08KWL7sDooyaztTv7VyJ5p1jRuVXqx/CpSnPQ0q1IR2Mp7ZneMbSfmCoo7k8AV7Jo1smm6Ta2fB8qMKT6t3/XNcB4JS3vNcSfym/dRM8e/s3ABx64JrvZiWVeowMGlNKLsccpOZfTYRnA/Cn49KzrF284LyR6VpgCmjCWjG0lPIppqrE3PF7K2iW+trqNEn/ebpBBAjuoBHeFlJzz1Wu58A+HW8T3bS3ru+lRSlpRJ8xd/7gEiB1OD1zwOnWuW8N28uu31tplt807KULyRLLtXnc7MQGHBI4PoK978O6fa6Tpdvp9ipWCBNq5JJPqST3JruoR9orvoc+Kbw75Vu/wNjSrWz020S0sLeO2gQYVIxgf/AF/xq8jD0qgH+UVJFL2JrraPMuzQV64H46+J5dA8IJb2shjudSnW2RgeQCRu/Q/lmu0WSvJv2kdJnv8AQ9N1eFzt0y4PmJ2IkAUN+BAH/Aql6amlJJzSZ5J4sSK8sL6LOGhuXIP+yTXnsVneK3l20pC5znPFdlqtzIYjPFw0gyc9zWJaiWQEMqL9OBXCqrPb9iitBZ3cU3my3bP6Afy9629NtpJZA8mfXJ5NR28OW5bgegrasiqIFjGT09TWcqreiNIUoxOg0G6u9NkgnsATc7hGiBQd5Y424PXOa9h8QW1pp1xGl4lsqzD5HLbNzY+YA9Mg/pXPfDDwbPZTRa3rSFblRm1t2HMWf42/2sdB269enot/bWeo2b2d/bRXNu+CY5FyCR0P1962+qe0p+9ozzq+LUavu7HHJa2uRLE0iejDDCnNFNj91LC59/lP61keKvh/cwu114Xv7u1bzCzxI+SoI6KMjcB1xnP1rhoPE3iTTysNxqKTTPIEjhvbYxMe2MkDnOB19a5Z4OrDZ3NIYlTZ6XL9riH7y3yPUDI/SoTdpg/KwPpXJ2/jy/gi8y80WTaDhntpgRn6c/zrStPHug3iZmkeMcA+dBkAn3XPpWH72O6N7x6o/9k=";

export default function ProjectsHome({ projects, onNew, onOpen, onRename, onDelete, storage }) {
  const [menuId, setMenuId] = useState(null); // project id with its ⋮ menu open

  const doRename = async (p) => {
    setMenuId(null);
    const name = await showPrompt("Rename project", {
      title: "Rename project", defaultValue: p.name || "Untitled project", okText: "Rename",
    });
    if (name && name.trim()) onRename(p.id, name.trim());
  };
  const doDelete = async (p) => {
    setMenuId(null);
    const ok = await showConfirm(
      `Delete "${p.name || "Untitled"}"? This permanently removes the project and its media from this device.`,
      { title: "Delete project", okText: "Delete", danger: true }
    );
    if (ok) onDelete(p.id);
  };

  return (
    <main className="ph" onClick={() => menuId && setMenuId(null)}>
      <header className="ph__topbar">
        <div className="ph__bar">
          <div className="ph__brand">
            <img className="ph__logo" src="/logo.svg" alt="" width="26" height="26" />
            <span className="ph__name"><span className="ph__pre">AutoEditor</span> Mod <span className="ph__version">v1.6</span></span>
          </div>
          <div className="ph__actions">
            {storage && storage.quota ? (
              <span className="ph__storage" tabIndex={0} role="tooltip" aria-label="Browser storage used by AutoEditor">
                {fmtBytes(Math.max(0, storage.quota - storage.usage))} left of {fmtBytes(storage.quota)}
                <span className="ph__storage-tip">
                  <b>Storage balance</b>
                  Projects, media files and captures are saved in your browser's storage so you can keep working offline. If it fills up, the oldest/lowest-quality items get evicted first.
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="ph__body">
        <div className="ph__head">
          <h1 className="ph__title">Your projects</h1>
          <p className="ph__sub">Pick up where you left off — or start a fresh cut.</p>
        </div>

        <div className="ph__grid">
          <button className="ph__new" onClick={onNew}>
            <span className="ph__new-plus">＋</span>
            <span className="ph__new-label">New project</span>
          </button>

          {projects.map((p) => (
            <div key={p.id} className="pcard" onClick={() => onOpen(p.id)}>
              <div className="pcard__thumb">
                {p.thumb ? <img src={p.thumb} alt="" /> : <span className="pcard__noimg">▦</span>}
                {p.durationSec ? <span className="pcard__dur">{clock(p.durationSec)}</span> : null}
              </div>
              <div className="pcard__foot">
                <div className="pcard__meta">
                  <span className="pcard__name" title={p.name}>{p.name || "Untitled"}</span>
                  <span className="pcard__sub">
                    {p.clipCount ? `${p.clipCount} clip${p.clipCount > 1 ? "s" : ""} · ` : ""}{timeAgo(p.updatedAt)}
                  </span>
                </div>
                <div className="pcard__menuwrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="pcard__menu"
                    aria-label="Project options"
                    onClick={() => setMenuId(menuId === p.id ? null : p.id)}
                  >⋮</button>
                  {menuId === p.id && (
                    <div className="pcard__pop">
                      <button onClick={() => doRename(p)}>Rename</button>
                      <button className="pcard__pop-del" onClick={() => doDelete(p)}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {projects.length === 0 && (
          <div className="ph__empty-wrap">
            <p className="ph__empty">No projects yet — create your first one to get started.</p>
          </div>
        )}

        <footer className="ph__foot">
          <p className="ph__foot-note ph__owner">
            <img src={OWNER_PIC} alt="Frank Nwabenu" className="ph__owner-pic" />
            Owned by Frank Nwabenu
          </p>
        </footer>
      </div>
    </main>
  );
}
