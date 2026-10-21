/** Phase progress, never an estimate of seconds remaining. */
export class MapProgress {
  private bar: HTMLElement;
  private fill: HTMLElement;
  private text: HTMLElement;
  constructor(private element: HTMLElement) {
    this.bar=element.querySelector('[role=progressbar]')!;
    this.fill=element.querySelector('.map-progress-fill')!;
    this.text=element.querySelector('.map-progress-text')!;
  }
  update(label: string, completed: number, total: number) {
    this.element.hidden=false;
    const percent=total>0?Math.min(100,Math.floor(completed/total*100)):0;
    this.bar.setAttribute('aria-label',label);
    this.bar.setAttribute('aria-valuenow',String(percent));
    this.bar.setAttribute('aria-valuetext',`${label} · ${percent} %`);
    this.fill.style.width=`${percent}%`;
    this.text.textContent=`${label} · ${percent} %`;
  }
  reset() { this.element.hidden=true; this.fill.style.width='0%'; }
}
