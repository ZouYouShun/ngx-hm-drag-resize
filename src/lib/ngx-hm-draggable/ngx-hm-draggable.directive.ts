import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2, Input, Output, EventEmitter } from '@angular/core';
import { forkJoin, Subscription, fromEvent, merge, Observable } from 'rxjs';

import { NgxHmDragResizeService, Point, Destination } from '../ngx-hm-drag-resize.service';
import { tap, finalize, takeUntil, switchMap, map, filter } from 'rxjs/operators';

@Directive({
  selector: '[ngx-hm-draggable]'
})
export class NgxHmDraggableDirective implements AfterViewInit, OnDestroy {

  @Input('draggable-container') container: HTMLElement;
  @Input('draggable-enable') set dragEnable(value) {
    if (this.hm) {
      this.hm.set({ enable: value });
      // if (!value) {
      //   this._renderer.setStyle(this.dragElms, 'visibility', 'hidden');
      // } else {
      //   this._renderer.setStyle(this.dragElms, 'visibility', 'visible');
      // }
    }
    this._enabled = value;
  }
  get dragEnable() {
    return this._enabled;
  }
  private _enabled = true;
  @Output() dragComplete = new EventEmitter();

  private sub$: Subscription;

  private hm: HammerManager;

  private toPoint: Destination;

  private elementRect: ClientRect | DOMRect;
  private containerRect: ClientRect | DOMRect;
  private maxRight = 0;
  private maxBottom = 0;

  private startStyle: Destination;


  constructor(
    private _elm: ElementRef,
    private _renderer: Renderer2,
    private _service: NgxHmDragResizeService) { }

  ngAfterViewInit(): void {
    const elm = this._elm.nativeElement as HTMLElement;

    this._renderer.setStyle(elm, 'cursor', 'grab');
    this._renderer.setStyle(elm, 'cursor', '-webkit-grab');

    this.hm = new Hammer(elm);

    this.sub$ = forkJoin(
      fromEvent(this.hm, 'tap').pipe(
        tap(() => {
          this._service.setFocus(this._elm.nativeElement);
        })
      ),
      this.bindDrag(elm, this.hm),
      this._service.resizeFromPinch$.pipe(
        tap(() => this.hm.stop(true))
      ),
    ).subscribe();

    this.dragEnable = this.dragEnable;
  }

  bindDrag(
    elm: HTMLElement,
    hm: HammerManager
  ): Observable<any> {

    hm.get('pan').set({ direction: Hammer.DIRECTION_ALL });

    const panStart$ = fromEvent(hm, 'panstart').pipe(
      tap(() => {
        // set grabbing
        this._renderer.setStyle(elm, 'cursor', 'grabbing');
        this._renderer.setStyle(elm, 'cursor', '-webkit-grabbing');

        this._service.setFocus(this._elm.nativeElement);
      })
    );
    const panMove$ = fromEvent(hm, 'panmove').pipe(
      finalize(() => {
        this._renderer.setStyle(elm, 'cursor', '-webkit-grab');
        this._renderer.setStyle(elm, 'cursor', 'grab');
      }),
      takeUntil(
        merge(
          fromEvent(hm, 'panend').pipe(
            filter(() => !!this.toPoint),
            tap(() => {
              this.dragComplete.emit({
                left: this.toPoint ? this.toPoint.left : 0,
                top: this.toPoint ? this.toPoint.top : 0,
              });
              this._renderer.setStyle(elm, 'transform',
                `translate(0, 0)`
              );
            }),
          ),
          this._service.resizeFromPan$
        ))
    );

    return panStart$.pipe(
      tap(() => {
        if (this.container) {
          this.elementRect = this.container ? elm.getBoundingClientRect() : null;
          this.containerRect = this.container ? this.container.getBoundingClientRect() : null;

          this.maxRight = this.containerRect.right - this.containerRect.left - this.elementRect.width;
          this.maxBottom = this.containerRect.bottom - this.containerRect.top - this.elementRect.height;
        }

        this.startStyle = {
          left: parseInt(elm.style.left, 10) || 0,
          top: parseInt(elm.style.top, 10) || 0,
        };

      }),
      switchMap(() => panMove$),
      map((e: HammerInput) => this.fixedInArea(e)),
      tap(() => this._renderer.setStyle(elm, 'transform',
        `translate(${this.toPoint.left - this.startStyle.left}px,
             ${this.toPoint.top - this.startStyle.top}px)`
      )),
    );
  }

  ngOnDestroy(): void {
    this.hm.destroy();
    this.sub$.unsubscribe();
  }

  private fixedInArea(
    e: HammerInput
  ): Point {

    this.toPoint = {
      left: this.startStyle.left + e.deltaX,
      top: this.startStyle.top + e.deltaY,
    };

    if (this.container) {

      if (e.deltaX < 0) {
        this.toPoint.left = Math.max(this.toPoint.left, 0);
      } else {
        this.toPoint.left = Math.min(this.toPoint.left, this.maxRight);
      }

      if (e.deltaY < 0) {
        this.toPoint.top = Math.max(this.toPoint.top, 0);
      } else {
        this.toPoint.top = Math.min(this.toPoint.top, this.maxBottom);
      }
    }
    return this.toPoint;
  }

}
