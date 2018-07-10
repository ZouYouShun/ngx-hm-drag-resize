import { CommonModule } from '@angular/common';
import { ModuleWithProviders, NgModule } from '@angular/core';

import { NgxHmDraggableDirective } from './ngx-hm-draggable/ngx-hm-draggable.directive';
import { NgxHmResizableComponent } from './ngx-hm-resizable/ngx-hm-resizable.component';

@NgModule({
  imports: [
    CommonModule
  ],
  declarations: [
    NgxHmDraggableDirective,
    NgxHmResizableComponent
  ],
  exports: [
    NgxHmDraggableDirective,
    NgxHmResizableComponent
  ]
})
export class NgxHmDragResizeModule {
}
