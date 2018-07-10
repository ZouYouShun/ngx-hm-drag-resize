import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NgxHmResizableComponent } from './ngx-hm-resizable.component';

describe('NgxHmResizableComponent', () => {
  let component: NgxHmResizableComponent;
  let fixture: ComponentFixture<NgxHmResizableComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NgxHmResizableComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NgxHmResizableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
