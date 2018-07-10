import { CommonModule } from '@angular/common';
import { ModuleWithProviders, NgModule } from '@angular/core';

import { NgxHmDraggableDirective } from './ngx-hm-draggable.directive';
import { NgxHmResizableDirective } from './ngx-hm-resizable.directive';
// import { NgxHmResizableComponent } from './ngx-hm-resizable/ngx-hm-resizable.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [
    NgxHmDraggableDirective,
    NgxHmResizableDirective,
    // NgxHmResizableComponent
  ],
  exports: [
    NgxHmDraggableDirective,
    NgxHmResizableDirective,
    // NgxHmResizableComponent
  ]
})
export class NgxHmDragResizeModule {
}
