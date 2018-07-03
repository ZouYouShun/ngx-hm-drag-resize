import { EventEmitter, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { fromEvent, Observable, Subject, merge, BehaviorSubject } from 'rxjs';
import { finalize, switchMap, take, takeUntil, tap, map } from 'rxjs/operators';

// tslint:disable-next-line:import-blacklist


/**
 * Example
<div #continer style="width: 500px; height:500px; position: absolute; left:50px; top:50px; border:1px solid white">

  <div style="position: relative;">

      <div hm-draggable [hm-draggable-container]="continer"
           hm-resize style="width:200px;height:200px;background:chocolate">
          sdadasd
        </div>
  </div>

</div>
 */

export interface Point {
  left: number;
  top: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
  cursor?: string;
}

export interface Destination {
  left: number;
  top: number;
}

export interface Size {
  width: number;
  height: number;
}

@Injectable({
  providedIn: 'root'
})
export class NgxHmDragResizeService {

  resize$ = new Subject();

  nowFocusElm = new BehaviorSubject<HTMLElement>(null);

  resizeDragElm: any[] = [
    {
      left: 0,
      top: 0,
      cursor: 'nw-resize'
    },
    {
      left: 'calc(50% - 5px)',
      top: 0,
      cursor: 'n-resize'
    },

    {
      right: 0,
      top: 0,
      cursor: 'ne-resize'
    },
    {
      right: 0,
      top: 'calc(50% - 5px)',
      cursor: 'e-resize'
    },
    {
      right: 0,
      bottom: 0,
      cursor: 'se-resize'
    },
    {
      left: 'calc(50% - 5px)',
      bottom: 0,
      cursor: 's-resize'
    },
    {
      left: 0,
      bottom: 0,
      cursor: 'sw-resize'
    },
    {
      left: 0,
      top: 'calc(50% - 5px)',
      cursor: 'w-resize'
    },
  ];

  constructor() { }

  setFocus(elm: HTMLElement) {
    if (this.nowFocusElm.value !== elm) {
      this.nowFocusElm.next(elm);
    }
  }

  clearFocus() {
    this.nowFocusElm.next(null);
  }
}
