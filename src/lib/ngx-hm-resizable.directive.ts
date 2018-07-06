import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2, EventEmitter, Output, Input } from '@angular/core';
import { forkJoin, fromEvent, Subscription, Observable, merge } from 'rxjs';
import { tap, takeUntil, switchMap, map, finalize } from 'rxjs/operators';

import { NgxHmDragResizeService, Point, Size, Destination, addStyle } from './ngx-hm-drag-resize.service';

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

  private angle = 0;

  private onlyX = false;
  private onlyY = false;

  private scale = 1;

  private savezIndex = 0;

  private _isFocus = false;
  set isFocus(value) {
    // only when value is change set value
    if (this.isFocus !== value) {
      if (value) {
        this.hmList.forEach((hm) => {
          hm.set({ enable: true });
        });
        this._renderer.setStyle(this._elm.nativeElement, 'z-index', this.savezIndex + 1);
        this._renderer.setStyle(this.dragElms, 'visibility', 'visible');
      } else {
        this.hmList.forEach((hm) => {
          hm.set({ enable: false });
        });
        this._renderer.setStyle(this._elm.nativeElement, 'z-index', this.savezIndex);
        this._renderer.setStyle(this.dragElms, 'visibility', 'hidden');
      }
    }
    this._isFocus = value;
  }

  private dragElms: HTMLElement;
  private firstChild: HTMLElement;

  constructor(
    private _elm: ElementRef,
    private _renderer: Renderer2,
    private _service: NgxHmDragResizeService
  ) { }

  ngAfterViewInit(): void {
    // 如果可以反轉，才要找第一個元素
    if (this.reverse && (<HTMLElement>this._elm.nativeElement).childElementCount > 0) {
      this.firstChild = (<HTMLElement>this._elm.nativeElement).children.item(0) as HTMLElement;
    }
    this.savezIndex = this._elm.nativeElement.style['z-index'];

    const obs$ = [
      this._service.nowFocusElm$.pipe(
        tap((element) => {
          if (element === this._elm.nativeElement) {
            this.isFocus = true;
          } else {
            this.isFocus = false;
          }
        })
      ),
      // bind all hammer event
      this.bindAllResize()
    ];

    if (this._service.isMobile) {
      obs$.push(this.bindZoomInOut(this._elm.nativeElement));
    }

    this.sub = forkJoin(obs$).subscribe();
  }

  bindZoomInOut(
    elm: HTMLElement,
  ) {
    const hm = new Hammer(elm);
    this.hmList.push(hm);

    hm.get('pinch').set({ enable: true });

    let centerPoint: HammerPoint;
    let startAngle: number;

    const pinchstart$ = fromEvent(hm, 'pinchstart').pipe(
      tap((e: HammerInput) => {
        this._renderer.setStyle(this.dragElms, 'visibility', 'hidden');
        this._service.resize$.next('pinch');
        this.initElement(elm);
        centerPoint = {
          x: (this.elementRect.left + (this.elementRect.width / 2)),
          y: (this.elementRect.top + (this.elementRect.height / 2)),
        };
        startAngle = e.rotation;
      })
    );
    const pinchmove$ = fromEvent(hm, 'pinchmove').pipe(
      takeUntil(fromEvent(hm, 'pinchend').pipe(
        tap((e: HammerInput) => {
          this._renderer.setStyle(this.dragElms, 'visibility', 'visible');
          this.angle = (this.angle + (e.rotation - startAngle)) % 360;

          const resizeRect = this.firstChild.getBoundingClientRect();

          const elmScale = {
            x: this.size.width / resizeRect.width,
            y: this.size.height / resizeRect.height
          };
          this.delta = {
            left: (resizeRect.left - this.elementRect.left),
            top: (resizeRect.top - this.elementRect.top)
          };

          this.size = {
            width: resizeRect.width,
            height: resizeRect.height
          };
          console.log(e.scale);
          this.completeEmit(elm);
          this._renderer.setStyle(this.firstChild, 'transform',
            this.firstChild.style.transform + `scale(${elmScale.x}, ${elmScale.y})`);
          // 把最後的角度存起來
        })
      ))
    );

    return pinchstart$.pipe(
      tap(() => {
      }),
      switchMap(() => pinchmove$),
      tap((e: HammerInput) => {
        // console.log(e);
        this.size = {
          width: this.elementRect.width * e.scale,
          height: this.elementRect.height * e.scale,
        };

        this.zoomFixSize();

        this.delta = {
          left: centerPoint.x - (this.size.width / 2) - this.elementRect.left,
          top: centerPoint.y - (this.size.height / 2) - this.elementRect.top
        };

        this.toPoint = {
          left: this.elementRect.left + this.delta.left,
          top: this.elementRect.top + this.delta.top
        };

        this.zoomFixInArea();

      }),
      tap((e: HammerInput) => {
        this.setElmStyle(elm);
        this._renderer.setStyle(this.firstChild, 'transform', ` rotate(${(this.angle + (e.rotation - startAngle)) % 360}deg)`);
      }),
    );

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

      // bind this elm hammer event
      return this.bindResize(
        this._elm.nativeElement,
        hm,
        drag
      );
    });

    this._renderer.appendChild(this._elm.nativeElement, this.dragElms);

    // subscribe all obs$ once
    return forkJoin(
      // when click tap focus
      fromEvent(mainHm, 'tap').pipe(
        tap(() => {
          this._service.setFocus(this._elm.nativeElement);
        })
      ),
      ...obs$,
    );
  }

  private zoomFixInArea() {
    if (this.toPoint.left < this.containerRect.left) {
      this.delta.left = this.containerRect.left - this.elementRect.left;
    } else if (this.toPoint.left + this.size.width > this.containerRect.right) {
      this.delta.left = (this.containerRect.right - this.size.width);
      this.toPoint.left = this.containerRect.right - this.size.width;
      this.delta.left = this.toPoint.left - this.elementRect.left;
    }
    if (this.toPoint.top < this.containerRect.top) {
      this.delta.top = this.containerRect.top - this.elementRect.top;
    } else if (this.toPoint.top + this.size.height > this.containerRect.bottom) {
      this.delta.top = (this.containerRect.bottom - this.size.height);
      this.toPoint.top = this.containerRect.bottom - this.size.height;
      this.delta.top = this.toPoint.top - this.elementRect.top;
    }
  }

  private zoomFixSize() {
    if (this.size.width > this.containerRect.width) {
      this.size = {
        width: this.containerRect.width,
        height: this.containerRect.width * this.scale,
      };
    }
    if (this.size.height > this.containerRect.height) {
      this.size = {
        width: this.containerRect.height / this.scale,
        height: this.containerRect.height,
      };
    }
  }

  // bind one element hammer
  private bindResize(elm: HTMLElement, hm: HammerManager, type: Point): Observable<any> {

    let zeroPoint: Destination;
    let firstQudrant: number;

    hm.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    // disable when init, when focus set enable
    hm.set({ enable: false });

    const panStart$ = fromEvent(hm, 'panstart').pipe(
      tap((e: HammerInput) => {
        this._service.resize$.next('pan');
        this.onlyX = this.onlyY = false;
        this.initElement(elm);
        zeroPoint = this.initZeroPoint(type);
        firstQudrant = this.getQuadrant(zeroPoint, { left: e.center.x, top: e.center.y });
      })
    );

    const panMove$ = fromEvent(hm, 'panmove').pipe(
      takeUntil(
        merge(
          fromEvent(hm, 'panend').pipe(
            tap(() => this.completeEmit(elm))
          ),
        )
      )
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
        this.rotate = { ...this.rotate, ...this.getRotate(firstQudrant) };
        this.setElmStyle(elm);
        if (this.firstChild && this.reverse) {
          this._renderer.setStyle(this.firstChild.children.item(0), 'transform',
            `rotateX(${this.rotate.Xdeg + (180 * (+this.rotate.X))}deg)
            rotateY(${this.rotate.Ydeg + (180 * (+this.rotate.Y))}deg)`);
        }
      }),
    );
  }

  private initElement(elm: HTMLElement) {
    this.containerRect = this.container ? this.container.getBoundingClientRect() : null;
    this.elementRect = elm.getBoundingClientRect();
    this.scale = this.elementRect.height / this.elementRect.width;
    this.originalStyle = {
      left: parseInt(elm.style.left, 10) || 0,
      top: parseInt(elm.style.top, 10) || 0,
    };
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

  private setElmStyle(elm: HTMLElement) {
    this._renderer.setStyle(elm, 'width', `${this.size.width}px`);
    this._renderer.setStyle(elm, 'height', `${this.size.height}px`);
    this._renderer.setStyle(elm, 'transform', `translate(${this.delta.left}px, ${this.delta.top}px)`);
  }

  private completeEmit(elm: HTMLElement) {
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
    // this._service.complete$.next();
    this._renderer.setStyle(elm, 'transform', `translate(0, 0)`);
  }

  private getToPoint(e: HammerInput) {

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

  private getSize(zeroPoint: Destination) {
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
    this.hmList.forEach(hm => {
      hm.destroy();
    });
  }
}
