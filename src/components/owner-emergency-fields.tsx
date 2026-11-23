import React, { useState } from 'react';
import { Check, HeartPulse, PhoneCall, Plus, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { PhoneCountryInput } from '@/src/components/phone-country-input';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/select';
import {
  BLOOD_TYPE_OPTIONS,
  calculateAgeFromBirthDate,
  COMMON_ALLERGIES,
  COMMON_CONDITIONS,
  INSURANCE_INSTITUTION_PRESETS,
  RELATIONSHIP_OPTIONS,
  type BloodType,
  type EmergencyContact,
  type OrganDonorStatus,
  type OwnerEmergencyProfile,
  type RelationshipType,
} from '@/src/lib/emergency-profile';

interface OwnerEmergencyFieldsProps {
  value: OwnerEmergencyProfile;
  onChange: (next: OwnerEmergencyProfile) => void;
  disabled?: boolean;
  idPrefix?: string;
}

const EMPTY_SELECT = '__empty__';

function ContactCard({
  title,
  contact,
  onChange,
  disabled,
  idPrefix,
}: {
  title: string;
  contact: EmergencyContact;
  onChange: (next: EmergencyContact) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-slate-500 shrink-0" />
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`} className="text-xs">
          Nombre completo
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={contact.name}
          disabled={disabled}
          maxLength={100}
          placeholder="Ej. María Ruiz"
          onChange={(e) => onChange({ ...contact, name: e.target.value })}
        />
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-phone`} className="text-xs">
            Teléfono
          </Label>
          <PhoneCountryInput
            id={`${idPrefix}-phone`}
            value={contact.phone}
            disabled={disabled}
            onChange={(nextPhone) => onChange({ ...contact, phone: nextPhone })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Parentesco</Label>
          <Select
            value={contact.relationship || EMPTY_SELECT}
            disabled={disabled}
            onValueChange={(val) =>
              onChange({
                ...contact,
                relationship: val === EMPTY_SELECT ? '' : (val as RelationshipType),
                relationshipCustom: val === 'otro' ? contact.relationshipCustom : '',
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona parentesco" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT}>Sin especificar</SelectItem>
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {contact.relationship === 'otro' && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-rel-custom`} className="text-xs">
            Especificar parentesco
          </Label>
          <Input
            id={`${idPrefix}-rel-custom`}
            value={contact.relationshipCustom}
            disabled={disabled}
            maxLength={40}
            placeholder="Ej. Primo, Vecino, Jefe"
            onChange={(e) =>
              onChange({ ...contact, relationshipCustom: e.target.value })
            }
          />
        </div>
      )}
    </div>
  );
}

function TagMultiSelector({
  title,
  noneLabel,
  noneKnown,
  onToggleNone,
  presets,
  selected,
  onTogglePreset,
  customItems,
  onAddCustom,
  onRemoveCustom,
  customPlaceholder,
  disabled,
}: {
  title: string;
  noneLabel: string;
  noneKnown: boolean;
  onToggleNone: (checked: boolean) => void;
  presets: readonly string[];
  selected: string[];
  onTogglePreset: (item: string) => void;
  customItems: string[];
  onAddCustom: (item: string) => void;
  onRemoveCustom: (item: string) => void;
  customPlaceholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    const clean = draft.trim().slice(0, 80);
    if (!clean) return;
    onAddCustom(clean);
    setDraft('');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <Label className="text-sm font-semibold text-slate-900">{title}</Label>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={noneKnown}
            disabled={disabled}
            onChange={(e) => onToggleNone(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
          />
          <span>{noneLabel}</span>
        </label>
      </div>

      {!noneKnown && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {presets.map((item) => {
              const active = selected.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  disabled={disabled}
                  onClick={() => onTogglePreset(item)}
                  className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-left text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className="leading-snug">{item}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-1 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                disabled={disabled}
                maxLength={80}
                placeholder={customPlaceholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !draft.trim()}
                onClick={handleAdd}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar</span>
              </Button>
            </div>

            {customItems.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/70">
                {customItems.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-800"
                  >
                    <span className="font-medium break-words">{item}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemoveCustom(item)}
                      aria-label={`Quitar ${item}`}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function OwnerEmergencyFields({
  value,
  onChange,
  disabled = false,
  idPrefix = 'emg',
}: OwnerEmergencyFieldsProps) {
  const [medDraft, setMedDraft] = useState('');
  const calculatedAge = value.birthDate
    ? calculateAgeFromBirthDate(value.birthDate)
    : null;

  const togglePresetInGroup = (
    groupKey: 'allergies' | 'conditions',
    item: string,
  ) => {
    const group = value[groupKey];
    const exists = group.selected.includes(item);
    const nextSelected = exists
      ? group.selected.filter((s) => s !== item)
      : [...group.selected, item];
    onChange({
      ...value,
      [groupKey]: {
        ...group,
        noneKnown: false,
        selected: nextSelected,
      },
    });
  };

  const addCustomToGroup = (
    groupKey: 'allergies' | 'conditions',
    item: string,
  ) => {
    const group = value[groupKey];
    const exists =
      group.custom.some((c) => c.toLowerCase() === item.toLowerCase()) ||
      group.selected.some((s) => s.toLowerCase() === item.toLowerCase());
    if (exists) return;
    onChange({
      ...value,
      [groupKey]: {
        ...group,
        noneKnown: false,
        custom: [...group.custom, item],
      },
    });
  };

  const removeCustomFromGroup = (
    groupKey: 'allergies' | 'conditions',
    item: string,
  ) => {
    const group = value[groupKey];
    onChange({
      ...value,
      [groupKey]: {
        ...group,
        custom: group.custom.filter((c) => c !== item),
      },
    });
  };

  const handleAddMedication = () => {
    const clean = medDraft.trim().slice(0, 80);
    if (!clean) return;
    if (value.medications.items.some((m) => m.toLowerCase() === clean.toLowerCase())) {
      setMedDraft('');
      return;
    }
    onChange({
      ...value,
      medications: {
        noneKnown: false,
        items: [...value.medications.items, clean],
      },
    });
    setMedDraft('');
  };

  return (
    <div className="space-y-5">
      {/* 1. Vital Identity Data */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-red-600 shrink-0" />
          <h4 className="text-sm font-semibold text-slate-900">
            Datos vitales e identificación
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${idPrefix}-birth-date`} className="text-xs">
                Fecha de nacimiento
              </Label>
              {calculatedAge !== null && (
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-700">
                  {calculatedAge} años
                </span>
              )}
            </div>
            <Input
              id={`${idPrefix}-birth-date`}
              type="date"
              value={value.birthDate}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, birthDate: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de sangre</Label>
            <Select
              value={value.bloodType || EMPTY_SELECT}
              disabled={disabled}
              onValueChange={(val) =>
                onChange({
                  ...value,
                  bloodType: val === EMPTY_SELECT ? '' : (val as BloodType),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_SELECT}>No especificado</SelectItem>
                {BLOOD_TYPE_OPTIONS.map((bt) => (
                  <SelectItem key={bt} value={bt}>
                    {bt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Donador de órganos</Label>
            <Select
              value={value.organDonor}
              disabled={disabled}
              onValueChange={(val) =>
                onChange({ ...value, organDonor: val as OrganDonorStatus })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unspecified">No especificado</SelectItem>
                <SelectItem value="yes">Sí, es donador</SelectItem>
                <SelectItem value="no">No es donador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-city-state`} className="text-xs">
              Ciudad / Estado
            </Label>
            <Input
              id={`${idPrefix}-city-state`}
              value={value.cityState}
              disabled={disabled}
              maxLength={80}
              placeholder="Ej. Guadalajara, Jal."
              onChange={(e) => onChange({ ...value, cityState: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* 2. Emergency Contacts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ContactCard
          title="Contacto de emergencia 1"
          contact={value.contact1}
          disabled={disabled}
          idPrefix={`${idPrefix}-c1`}
          onChange={(next) => onChange({ ...value, contact1: next })}
        />
        <ContactCard
          title="Contacto de emergencia 2"
          contact={value.contact2}
          disabled={disabled}
          idPrefix={`${idPrefix}-c2`}
          onChange={(next) => onChange({ ...value, contact2: next })}
        />
      </div>

      {/* 3. Allergies & Conditions */}
      <TagMultiSelector
        title="Alergias"
        noneLabel="Sin alergias conocidas"
        noneKnown={value.allergies.noneKnown}
        onToggleNone={(checked) =>
          onChange({
            ...value,
            allergies: checked
              ? { noneKnown: true, selected: [], custom: [] }
              : { ...value.allergies, noneKnown: false },
          })
        }
        presets={COMMON_ALLERGIES}
        selected={value.allergies.selected}
        onTogglePreset={(item) => togglePresetInGroup('allergies', item)}
        customItems={value.allergies.custom}
        onAddCustom={(item) => addCustomToGroup('allergies', item)}
        onRemoveCustom={(item) => removeCustomFromGroup('allergies', item)}
        customPlaceholder="Otra alergia (ej. Yodo, Fresas) — escribe 1 por 1"
        disabled={disabled}
      />

      <TagMultiSelector
        title="Enfermedades o condiciones médicas"
        noneLabel="Ninguna conocida"
        noneKnown={value.conditions.noneKnown}
        onToggleNone={(checked) =>
          onChange({
            ...value,
            conditions: checked
              ? { noneKnown: true, selected: [], custom: [] }
              : { ...value.conditions, noneKnown: false },
          })
        }
        presets={COMMON_CONDITIONS}
        selected={value.conditions.selected}
        onTogglePreset={(item) => togglePresetInGroup('conditions', item)}
        customItems={value.conditions.custom}
        onAddCustom={(item) => addCustomToGroup('conditions', item)}
        onRemoveCustom={(item) => removeCustomFromGroup('conditions', item)}
        customPlaceholder="Otra enfermedad (ej. Tiroides, Arritmia) — escribe 1 por 1"
        disabled={disabled}
      />

      {/* 4. Medications */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Label className="text-sm font-semibold text-slate-900">
            Medicamentos actuales
          </Label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={value.medications.noneKnown}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  medications: e.target.checked
                    ? { noneKnown: true, items: [] }
                    : { ...value.medications, noneKnown: false },
                })
              }
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>No toma medicamentos</span>
          </label>
        </div>

        {!value.medications.noneKnown && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={medDraft}
                disabled={disabled}
                maxLength={80}
                placeholder="Ej. Metformina 850mg, Losartán (agrega 1 por 1)"
                onChange={(e) => setMedDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMedication();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !medDraft.trim()}
                onClick={handleAddMedication}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Agregar</span>
              </Button>
            </div>

            {value.medications.items.length > 0 && (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/70">
                {value.medications.items.map((med) => (
                  <div
                    key={med}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-800"
                  >
                    <span className="font-medium break-words">{med}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          ...value,
                          medications: {
                            ...value.medications,
                            items: value.medications.items.filter((m) => m !== med),
                          },
                        })
                      }
                      aria-label={`Quitar ${med}`}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Social Security (NSS) & Medical Insurance */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" />
          <h4 className="text-sm font-semibold text-slate-900">
            Seguridad social (NSS) y seguro médico
          </h4>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-ins-inst`} className="text-xs">
            Institución o aseguradora
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {INSURANCE_INSTITUTION_PRESETS.map((preset) => {
              const active =
                value.insurance.institution.toUpperCase() === preset.toUpperCase();
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      insurance: {
                        ...value.insurance,
                        institution: active ? '' : preset,
                      },
                    })
                  }
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
          <Input
            id={`${idPrefix}-ins-inst`}
            value={value.insurance.institution}
            disabled={disabled}
            maxLength={80}
            placeholder="Ej. IMSS, ISSSTE, GNP, AXA..."
            onChange={(e) =>
              onChange({
                ...value,
                insurance: { ...value.insurance, institution: e.target.value },
              })
            }
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-ins-nss`} className="text-xs font-semibold">
              Número de Seguro Social (NSS)
            </Label>
            <Input
              id={`${idPrefix}-ins-nss`}
              value={value.insurance.nss}
              disabled={disabled}
              maxLength={40}
              placeholder="Ej. 12345678901"
              className="font-mono tabular-nums"
              onChange={(e) =>
                onChange({
                  ...value,
                  insurance: { ...value.insurance, nss: e.target.value },
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-ins-policy`} className="text-xs">
              No. de póliza (si aplica)
            </Label>
            <Input
              id={`${idPrefix}-ins-policy`}
              value={value.insurance.policyNumber}
              disabled={disabled}
              maxLength={60}
              placeholder="Ej. POL-987654"
              className="font-mono tabular-nums"
              onChange={(e) =>
                onChange({
                  ...value,
                  insurance: { ...value.insurance, policyNumber: e.target.value },
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-ins-clinic`} className="text-xs">
              Clínica / UMF asignada
            </Label>
            <Input
              id={`${idPrefix}-ins-clinic`}
              value={value.insurance.clinic}
              disabled={disabled}
              maxLength={80}
              placeholder="Ej. UMF #52 / Hospital Ángeles"
              onChange={(e) =>
                onChange({
                  ...value,
                  insurance: { ...value.insurance, clinic: e.target.value },
                })
              }
            />
          </div>
        </div>
      </div>

      {/* 6. Rescue / Motorcycle Notes */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <Label htmlFor={`${idPrefix}-rescue-notes`} className="text-sm font-semibold text-slate-900">
              Notas rápidas de rescate o moto (opcional)
            </Label>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-400">
            {value.rescueNotes.length}/280
          </span>
        </div>
        <textarea
          id={`${idPrefix}-rescue-notes`}
          value={value.rescueNotes}
          disabled={disabled}
          maxLength={280}
          rows={2}
          placeholder="Ej. Usa lentes de contacto, placa metálica en brazo derecho, moto Yamaha MT-07 azul..."
          onChange={(e) => onChange({ ...value, rescueNotes: e.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:opacity-50"
        />
      </div>
    </div>
  );
}
