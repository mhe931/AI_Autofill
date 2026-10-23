import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormControl, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';

class AuditForm {
    constructor() {
        this.form = new FormGroup({
            title: new FormControl('', { validators: Validators.required, updateOn: 'blur' }),
            abstract: new FormControl('Existing abstract'),
            language: new FormControl(''),
            degree: new FormControl(''),
            faculty: new FormControl(''),
            reviewed: new FormControl(false),
            access: new FormControl('closed', { updateOn: 'blur' }),
            date: new FormControl(''),
            rejected: new FormControl('', Validators.pattern(/^approved$/)),
            deferred: new FormControl('Existing deferred value', { updateOn: 'submit' }),
            authors: new FormArray([new FormControl(''), new FormControl('')]),
            license: new FormControl(false)
        });
        this.open = '';
        this.optionsReady = signal(false);
        this.year = '';
        this.month = '';
        this.day = '';
        this.submitCount = 0;
        this.urnCount = 0;
        this.options = {
            language: ['Finnish', 'English'],
            degree: ['Master of Science', 'Doctor of Science'],
            faculty: ['School of Technology and Innovations', 'School of Management']
        };
        window.audit = this;
    }
    get authors() { return this.form.controls.authors; }
    show(key) {
        this.open = key;
        this.optionsReady.set(false);
        setTimeout(() => { this.optionsReady.set(true); }, 100);
    }
    choose(key, option) {
        const control = this.form.controls[key];
        control.setValue(option);
        control.markAsDirty();
        control.markAsTouched();
        this.open = '';
    }
    dateChange(part, event) {
        this[part] = event.target.value;
        const value = this.year + (this.month ? '-' + this.month.padStart(2, '0') : '') +
            (this.day ? '-' + this.day.padStart(2, '0') : '');
        this.form.controls.date.setValue(value);
        this.form.controls.date.markAsDirty();
        this.form.controls.date.markAsTouched();
    }
}

Component({
    selector: 'audit-form',
    standalone: true,
    imports: [ReactiveFormsModule],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    // The custom hosts reproduce DSpace's public event contract, not its entire application.
    template: `
      <form [formGroup]="form" (ngSubmit)="submitCount = submitCount + 1">
        <label for="title">Thesis title</label><input id="title" formControlName="title">
        <label for="abstract">Abstract</label><textarea id="abstract" formControlName="abstract"></textarea>
        @for (key of ['language', 'degree', 'faculty']; track key) {
          <label [attr.for]="key">{{key}}</label>
          <ds-dynamic-scrollable-dropdown>
            <div role="combobox" [attr.aria-expanded]="open === key">
              <input [id]="key" [name]="key" readonly [value]="form.controls[key].value"
                [attr.aria-controls]="key + '-options'" (click)="show(key)">
            </div>
            <div role="listbox" [id]="key + '-options'" [hidden]="open !== key">
              @if (optionsReady()) {
                @for (option of options[key]; track option) {
                  <button type="button" role="option" (mousedown)="choose(key, option)">{{option}}</button>
                }
              }
            </div>
          </ds-dynamic-scrollable-dropdown>
        }
        <ds-date-picker>
          <fieldset><legend>Publication date</legend>
            <input id="date_year" name="year" [value]="year" (change)="dateChange('year', $event)">
            <input id="date_month" name="month" [disabled]="!year" [value]="month" (change)="dateChange('month', $event)">
            <input id="date_day" name="day" [disabled]="!month" [value]="day" (change)="dateChange('day', $event)">
          </fieldset>
        </ds-date-picker>
        <label for="reviewed">Metadata reviewed</label><input id="reviewed" type="checkbox" formControlName="reviewed">
        <label><input type="radio" name="access" value="open" formControlName="access">Open</label>
        <label><input type="radio" name="access" value="closed" formControlName="access">Closed</label>
        <div formArrayName="authors">
          @for (control of authors.controls; track control; let i = $index) {
            <label [attr.for]="'author_' + i">Author</label><input [id]="'author_' + i" [formControlName]="i">
          }
        </div>
        <label for="rejected">Validated field</label><input id="rejected" formControlName="rejected">
        <label for="deferred">Deferred until submission</label><input id="deferred" formControlName="deferred">
        <ds-submission-section-license>
          <label for="license">I accept the license</label><input id="license" type="checkbox" formControlName="license">
        </ds-submission-section-license>
        <button id="generate-urn" type="button" (click)="urnCount = urnCount + 1">Generate URN</button>
        <button id="submit" type="submit">Submit</button>
      </form>`
})(AuditForm);

window.auditReady = bootstrapApplication(AuditForm, {
    providers: [provideZonelessChangeDetection()]
});
