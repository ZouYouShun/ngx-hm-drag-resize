import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2, EventEmitter, Output, Input } from '@angular/core';
import { forkJoin, fromEvent, Subscription, Observable } from 'rxjs';
import { tap, takeUntil, switchMap, map, finalize } from 'rxjs/operators';

import { NgxHmDragResizeService, Point, Size, Destination } from './ngx-hm-drag-resize.service';

@Directive({
  selector: '[ngx-hm-resizable]'
})
export class NgxHmResizableDirective implements AfterViewInit, OnDestroy {
  @Input('resizable-container') container: HTMLElement;
  @Input('reverse') reverse = false;
  @Input('scaling')
  get scaling() {
    return this._scaling;
  }
  set scaling(value) {
    this._scaling = value;
    this.singleDirectionElm.forEach(elm => {
      this._renderer.setStyle(elm, 'display', value ? 'none' : 'block');
    });
  }

  private _scaling = false;

  @Output() risizeComplete = new EventEmitter();

  private containerRect: ClientRect | DOMRect;
  private elementRect: ClientRect | DOMRect;

  private sub: Subscription;
  private hmSub: Subscription;
  private hmList: HammerManager[] = [];

  private originalStyle: Point;
  private toPoint: Destination;
  private delta: Destination;
  private size: Size;
  private nowQuadrant: number;

  private singleDirectionElm: HTMLElement[] = [];

  private rotate = {
    X: false,
    Y: false,
    Xdeg: 0,
    Ydeg: 0
  };

  private onlyX = false;
  private onlyY = false;

  private scale = 1;

  set isFocus(value) {
    if (value) {
      this._renderer.setStyle(this.dragElms, 'visibility', 'visible');
    } else {
      this._renderer.setStyle(this.dragElms, 'visibility', 'hidden');
    }
  }
  private dragElms: HTMLElement;
  private firstChild: Element;

  constructor(
    private _elm: ElementRef,
    private _renderer: Renderer2,
    private _service: NgxHmDragResizeService
  ) { }

  ngAfterViewInit(): void {
    // 如果可以反轉，才要找第一個元素
    if (this.reverse && (<HTMLElement>this._elm.nativeElement).childElementCount > 0) {
      this.firstChild = (<HTMLElement>this._elm.nativeElement).children.item(0);
    }

    // bind all hammer event
    this.bindAllResize();

    // bind service focus elm
    this.sub = this._service.nowFocusElm.pipe(
      tap((element) => {
        if (element === this._elm.nativeElement) {
          this.isFocus = true;
        } else {
          this.isFocus = false;
        }
      })
    ).subscribe();
  }

  bindAllResize() {
    const mainHm = new Hammer(this._elm.nativeElement);
    this.hmList.push(mainHm);

    this.dragElms = this._renderer.createElement('div') as HTMLElement;
    // generate an big div to set all pan element
    this._renderer.setAttribute(this.dragElms, 'id', 'dragElms');
    // get all pan event
    const obs$ = this._service.resizeDragElm.map((drag, i) => {

      const btn = this._renderer.createElement('div') as HTMLElement;
      addStyle(this._renderer, btn, {
        'box-sizing': 'border-box',
        'position': 'absolute',
        'width': '10px',
        'height': '10px',
        'font-size': '1px',
        'background': '#EEE',
        'border': '1px solid #333',
        ...drag
      });
      if (i % 2 === 1) {
        this.singleDirectionElm.push(btn);
      }
      this._renderer.appendChild(this.dragElms, btn);


      const hm = new Hammer(btn);
      // save all hammer object, when destory will remove
      this.hmList.push(hm);

      return forkJoin(
        // bind this elm hammer event
        this.bindResize(
          this._elm.nativeElement,
          hm,
          this.container,
          drag
        ),
      );
    });

    this._renderer.appendChild(this._elm.nativeElement, this.dragElms);

    // subscribe all obs$ once
    this.hmSub = forkJoin(
      // when click tap focus
      fromEvent(mainHm, 'tap').pipe(
        tap(() => {
          this._service.setFocus(this._elm.nativeElement);
        })
      ),
      ...obs$
    ).subscribe();
  }

  // bind one element hammer
  bindResize(
    elm: HTMLElement,
    hm: HammerManager,
    container: HTMLElement,
    type: Point
  ): Observable<any> {

    let zeroPoint: Destination;
    let firstQudrant: number;

    hm.get('pan').set({ direction: Hammer.DIRECTION_ALL });

    const panStart$ = fromEvent(hm, 'panstart').pipe(
      tap((e: HammerInput) => {
        this._service.resize$.next();
        this.onlyX = this.onlyY = false;
        this.elementRect = elm.getBoundingClientRect();
        this.containerRect = container ? container.getBoundingClientRect() : null;
        this.originalStyle = {
          left: parseInt(elm.style.left, 10) || 0,
          top: parseInt(elm.style.top, 10) || 0,
        };
        if (this.scaling) {
          this.scale = this.elementRect.height / this.elementRect.width;
        }
        zeroPoint = this.initZeroPoint(type);
        firstQudrant = this.getQuadrant(zeroPoint, { left: e.center.x, top: e.center.y });
      })
    );

    const panMove$ = fromEvent(hm, 'panmove').pipe(
      takeUntil(fromEvent(hm, 'panend').pipe(
        tap(() => {
          // save current rotate, and clear rotate
          this.rotate.Xdeg = (this.rotate.Xdeg + (180 * (+this.rotate.X))) % 360;
          this.rotate.Ydeg = (this.rotate.Ydeg + (180 * (+this.rotate.Y))) % 360;
          this.rotate.X = false;
          this.rotate.Y = false;

          this.risizeComplete.emit({
            left: this.originalStyle.left + this.delta.left,
            top: this.originalStyle.top + this.delta.top,
            height: this.size.height,
            width: this.size.width,
            rotateX: this.rotate.Xdeg,
            rotateY: this.rotate.Ydeg
          });

          this._renderer.setStyle(elm, 'transform',
            `translate(0, 0)`
          );

        })
      ))
    );

    return panStart$.pipe(
      switchMap(() => panMove$),
      tap((e: HammerInput) => {
        this.toPoint = this.getToPoint(e);
        this.nowQuadrant = this.getQuadrant(zeroPoint, this.toPoint);
        this.size = this.getSize(zeroPoint);
        this.delta = this.getDelta(type, zeroPoint);
      }),
      tap(() => {
        this._renderer.setStyle(elm, 'width', `${this.size.width}px`);
        this._renderer.setStyle(elm, 'height', `${this.size.height}px`);
        this._renderer.setStyle(elm, 'transform', `translate(${this.delta.left}px, ${this.delta.top}px)`);

        this.rotate = { ...this.rotate, ...this.getRotate(firstQudrant) };

        if (this.firstChild && this.reverse) {
          this._renderer.setStyle(this.firstChild, 'transform',
            `rotateX(${this.rotate.Xdeg + (180 * (+this.rotate.X))}deg) rotateY(${this.rotate.Ydeg + (180 * (+this.rotate.Y))}deg)`
          );
        }
      }),
    );
  }

  private getRotate(firstQudrant: number) {

    const rotate = {
      X: false,
      Y: false
    };

    let dis = this.nowQuadrant - firstQudrant;

    if (dis < 0) { dis = dis + 4; }

    switch (dis) {
      case 1:
        if (firstQudrant % 2 === 1) {
          rotate.Y = true;
        } else {
          rotate.X = true;
        }
        break;
      case 2:
        rotate.Y = true;
        rotate.X = true;
        break;
      case 3:
        if (firstQudrant % 2 === 1) {
          rotate.X = true;
        } else {
          rotate.Y = true;
        }
        break;
    }
    return rotate;
  }

  private initZeroPoint(type: Point) {
    const zeroPoint: { left: number; top: number; } = {
      left: 0,
      top: 0
    };
    if (typeof (type.top) !== 'string') {
      zeroPoint.top = type.top === 0 ? this.elementRect.bottom : this.elementRect.top;
    } else {
      this.onlyX = true;
    }
    if (typeof (type.left) !== 'string') {
      zeroPoint.left = type.left === 0 ? this.elementRect.right : this.elementRect.left;
    } else {
      this.onlyY = true;
    }
    return zeroPoint;
  }

  private getDelta(type: Point, zeroPoint: Destination) {
    let delta: Destination;

    switch (this.nowQuadrant) {
      case 1:
        if (this.scaling) {
          delta = {
            left: 0,
            top: -this.size.height
          };
          break;
        }
        delta = {
          left: 0,
          top: this.toPoint.top - zeroPoint.top
        };
        break;
      case 2:
        if (this.scaling) {
          delta = {
            left: -this.size.width,
            top: -this.size.height
          };
          break;
        }
        delta = {
          left: this.toPoint.left - zeroPoint.left,
          top: this.toPoint.top - zeroPoint.top
        };
        break;
      case 3:
        if (this.scaling) {
          delta = {
            left: -this.size.width,
            top: 0
          };
          break;
        }
        delta = {
          left: this.toPoint.left - zeroPoint.left,
          top: 0
        };
        break;
      case 4:
        delta = {
          left: 0,
          top: 0
        };
        break;

      default:
        break;
    }

    if (type.left === 0) {
      delta.left = this.elementRect.width - Math.abs(delta.left);
    }
    if (type.top === 0) {
      delta.top = this.elementRect.height - Math.abs(delta.top);
    }
    return delta;
  }

  private getQuadrant(zeroPoint: Point, toPoint: Destination) {
    let quadrant: number;
    if (toPoint.left - zeroPoint.left > 0) {
      quadrant = toPoint.top - zeroPoint.top > 0 ? 4 : 1;
    } else {
      quadrant = toPoint.top - zeroPoint.top > 0 ? 3 : 2;
    }
    return quadrant;
  }

  private getSize(zeroPoint: { left: number, top: number }) {
    let width = Math.abs(zeroPoint.left - this.toPoint.left);
    let height = this.scaling ? width * this.scale : Math.abs(zeroPoint.top - this.toPoint.top);
    if (this.scaling) {
      let maxHeight;
      switch (this.nowQuadrant) {
        case 1:
        case 2:
          maxHeight = Math.abs(zeroPoint.top - this.containerRect.top);
          break;
        case 3:
        case 4:
          maxHeight = Math.abs(zeroPoint.top - this.containerRect.bottom);
          break;
      }
      if (height > maxHeight) {
        height = maxHeight;
        width = height / this.scale;
      }
    }

    return {
      width: this.onlyY ? this.elementRect.width : width,
      height: this.onlyX ? this.elementRect.height : height
    };
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.hmSub) {
      this.hmList.forEach(hm => {
        hm.destroy();
      });
      this.hmSub.unsubscribe();
    }
  }

  private getToPoint(
    e: HammerInput,
  ) {

    const toPoint = {
      left: e.center.x,
      top: e.center.y,
    };

    if (this.containerRect) {
      toPoint.top = Math.max(toPoint.top, this.containerRect.top);
      toPoint.top = Math.min(toPoint.top, this.containerRect.bottom);
      toPoint.left = Math.max(toPoint.left, this.containerRect.left);
      toPoint.left = Math.min(toPoint.left, this.containerRect.right);
    }
    return toPoint;
  }
}

export function addStyle(_renderer: Renderer2, elm: HTMLElement, style: { [key: string]: string | number }) {
  if (style) {
    Object.keys(style).forEach((key) => {
      const value = style[key];
      _renderer.setStyle(elm, key, value);
    });
  }
}
