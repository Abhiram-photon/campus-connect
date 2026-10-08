"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { saveEventInterestAction } from "@/app/workspace-actions";
import type { Skill } from "@/lib/types";

export function InterestDialog({
  eventId,
  profileSkills,
  allSkills,
  offeredIds,
  neededIds,
  alreadyInterested,
}: {
  eventId: string;
  profileSkills: Skill[];
  allSkills: Skill[];
  offeredIds: string[];
  neededIds: string[];
  alreadyInterested: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={14} />{alreadyInterested ? "Edit teammate preferences" : "Show interest"}
      </button>
      {open ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="interest-modal" role="dialog" aria-modal="true" aria-labelledby="interest-title">
            <div className="modal-head">
              <div><p className="page-eyebrow">Event collaboration</p><h2 className="section-title" id="interest-title">Find teammates</h2></div>
              <button className="btn btn-quiet btn-small" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>
            </div>
            <p className="row-copy" style={{ marginBottom: 16 }}>Choose the skills you can contribute and the skills you need. Matches are registered students who are also looking for teammates at this event.</p>
            <ActionForm action={saveEventInterestAction} submitLabel="Save interest" pendingLabel="Saving…" buttonClassName="" className="form-stack" hideFeedback={false}>
              <input type="hidden" name="eventId" value={eventId} />
              <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
                <legend className="field-label" style={{ marginBottom: 7 }}>Skills you can offer</legend>
                {profileSkills.length ? <div className="checkbox-grid">{profileSkills.map((skill) => <label className="checkbox-row" key={skill.id}><input type="checkbox" name="skills_offered" value={skill.id} defaultChecked={offeredIds.includes(skill.id) || (!alreadyInterested && offeredIds.length === 0)} /><span>{skill.name}</span></label>)}</div> : <p className="field-hint">Add skills to your profile before showing event interest.</p>}
              </fieldset>
              <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
                <legend className="field-label" style={{ marginBottom: 7 }}>Skills you need <span style={{ color: "#87919a", fontWeight: 400 }}>· select at least one</span></legend>
                <div className="checkbox-grid">{allSkills.map((skill) => <label className="checkbox-row" key={skill.id}><input type="checkbox" name="skills_needed" value={skill.id} defaultChecked={neededIds.includes(skill.id)} /><span>{skill.name}</span></label>)}</div>
              </fieldset>
            </ActionForm>
            <p className="field-hint" style={{ marginTop: 12 }}>This does not change your event registration. You can update these preferences at any time.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
