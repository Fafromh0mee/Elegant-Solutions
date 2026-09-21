# Elegant Solution — Lab Access V2

Status: In Development
Branch: `integration/lab-access-v2`

## Purpose

This document is the source of truth for the Lab Access V2 redesign.

The implementation must be built incrementally on top of `main` through
`integration/lab-access-v2`.

The branch `feature/lab-access-updates` is READ-ONLY REFERENCE ONLY.

Do not merge, rebase, or port the branch wholesale.

Features may be inspected and selectively reimplemented only when they match
the requirements in this document.

---

# 1. Core Principles

## 1.1 Local-first development

All development and testing must happen locally first.

Do not:

- modify production/AONA
- deploy during feature development
- connect local development directly to the production database
- run destructive database operations without explicit approval

Local environment:

- Next.js web app
- PostgreSQL via `elegant-postgres`
- Python/FastAPI AI service when required

---

## 1.2 One feature at a time

Each implementation task must:

1. inspect current code
2. compare with this requirement
3. inspect `feature/lab-access-updates` only when relevant
4. report proposed changes before major schema/business-logic changes
5. implement only the requested feature
6. validate
7. summarize changed files
8. stop before starting the next feature

Do not opportunistically refactor unrelated features.

---

# 2. Academic Time Slots

Room booking and academic schedules use standard university time slots.

| Slot   | Time        |
| ------ | ----------- |
| SLOT_1 | 08:40–11:00 |
| SLOT_2 | 12:00–14:20 |
| SLOT_3 | 14:30–16:50 |
| SLOT_4 | 17:00–19:20 |

Users must not enter arbitrary booking start/end times.

Booking must use one or more academic slots.

The implementation must avoid scattering hardcoded times throughout the code.

Prefer a central configuration/data model so slot times can be changed later.

---

# 3. Room Model

A room can support multiple capabilities.

Supported capabilities:

- CLASSROOM
- LAB
- MEETING
- WORKSHOP
- EVENT

A room may support more than one capability.

Example:

A room may be both:

- CLASSROOM
- LAB

During scheduled classes it behaves as a classroom.

When no class is scheduled, it may be available for lab use depending on
room policy and availability.

---

# 4. Room Configuration

Each room should support configuration for:

## General information

- room code
- room name
- building
- floor
- capacity
- active/inactive state

## Capabilities

Multiple values allowed:

- CLASSROOM
- LAB
- MEETING
- WORKSHOP
- EVENT

## Booking approval policy

Two policies:

### AUTO

If all booking conditions pass, the booking is approved automatically.

No admin action is required.

### MANUAL

The booking remains `PENDING` until an administrator approves or rejects it.

UI wording:

- อนุมัติอัตโนมัติ
- ต้องได้รับการอนุมัติจากผู้ดูแลระบบ

Admin approval must NOT be required globally for all rooms.

---

# 5. Room Booking Availability

Room availability must be calculated centrally.

Do not duplicate different availability logic across pages.

Availability should consider:

- room active status
- room maintenance / temporary closure
- allowed booking day/slot
- class schedules
- existing bookings
- capacity
- booking status

Example derived statuses:

- พร้อมใช้งาน
- กำลังมีการเรียน
- ห้องเต็ม
- นอกช่วงเปิดใช้งาน
- ปิดปรับปรุง
- ปิดใช้งาน

The system should also provide useful supporting information such as:

- remaining capacity
- when the room becomes available
- what currently blocks availability

---

# 6. Capacity

Each room has a maximum capacity.

Bookings must include the expected number of users.

For capacity-based availability:

existing approved occupancy

- new booking party size
  must not exceed room capacity.

Example:

Room capacity: 40

Existing bookings:

- 10 users
- 15 users

Remaining:

15 users

A request for 16 users must not be accepted.

When remaining capacity reaches zero, UI must display:

`ห้องเต็ม`

Do not use wording such as `จองทั้งห้อง` for the full state.

---

# 7. Room Booking UX

Do not show hundreds of rooms simultaneously in one large timetable.

The main UX should be search-first.

Users should be able to input:

- number of users
- date
- academic slot
- required room capability

Optional filters:

- building
- floor
- only available rooms

Example:

จำนวนผู้ใช้งาน: 6
วันที่: 22 ก.ย. 2569
ช่วงเวลา: คาบ 3 · 14:30–16:50
ประเภทพื้นที่: Lab

[ค้นหาห้อง]

Results should show only relevant rooms.

Each result should include useful information such as:

- room code/name
- capabilities
- capacity
- remaining capacity
- availability status

---

# 8. Available Now

The student dashboard should include an `Available now` experience.

Example:

ห้องที่ว่างตอนนี้

LAB-201
Lab · รองรับ 40 คน
เหลือ 12 ที่

LAB-305
ห้องเต็ม
30/30 คน

Also provide a compact search entry such as:

หาห้องสำหรับ [6] คน

The normal booking flow must still use academic slots.

---

# 9. Scheduled Access vs Room Booking

These are separate concepts.

## Scheduled Access

If a student already has a class in their schedule:

- no admin approval is required
- access is granted automatically according to the schedule
- access begins 30 minutes before class
- access expires at class end

Example:

Class:
14:30–16:50

Access:
14:00–16:50

A scheduled class must NOT create a normal manual approval request.

---

## Room Booking

A student may independently search for and book an available room.

Flow:

Room availability check
→ booking request

If room approval policy is AUTO:

→ APPROVED automatically

If room approval policy is MANUAL:

→ PENDING
→ administrator approves or rejects

---

# 10. Booking / Request Status

Supported states:

- PENDING
- APPROVED
- REJECTED
- CANCELLED

Users can cancel their own eligible booking/request.

Rejected and cancelled bookings must never grant access.

---

# 11. Admin Approval

The admin approval interface exists only for bookings requiring manual approval.

It must not become a queue for every room access event.

Admin should be able to see:

- requester
- room
- date
- slot
- number of users
- purpose
- conflicts
- capacity context

Actions:

- Approve
- Reject
- Reject with reason where supported

Availability and capacity must be revalidated at approval time.

---

# 12. Gate Security

Gate access must fail closed.

Before granting access, verify:

- valid access source
- correct user
- face verification when required
- booking/access is approved
- request is not cancelled/rejected
- correct room
- valid date/time/slot
- applicable access window

Guest bypass is allowed only for the designated `GUEST` account according to
existing system policy.

Door hardware integration is out of scope for now.

Keep `unlockDoorAction` as an abstraction/stub where appropriate.

---

# 13. Schedule Management

Admin schedule management should support:

- list schedules
- search
- semester filter
- pagination
- manual create
- edit
- delete
- conflict detection

Schedule modifications should be logged with:

`SCHEDULE_MODIFIED`

Academic schedules should align with the same slot definitions used by room
booking where possible.

---

# 14. BU Mobile Schedule OCR

Students should be able to import their class schedule using screenshots from
the BU Mobile Class Schedule page.

Support multiple screenshots because the schedule may require scrolling and
screenshots may overlap.

OCR should extract where available:

- student name
- semester
- day of week
- course code
- section
- course name
- class type such as LECT / LAB / RWS
- class time
- room
- No.

Time should be normalized into the standard academic slot.

Example:

14.30 - 16.50
→ SLOT_3

OCR parsing should use deterministic validation where possible.

---

## OCR identity check

The screenshot includes the student's name.

Compare the OCR result with the currently authenticated user's name.

Purpose:

Prevent accidental import of another student's screenshot.

This is NOT strong identity verification because screenshots can be modified.

Do not treat OCR name matching as a security credential.

---

## OCR deduplication

Multiple screenshots may contain overlapping classes.

Do not import duplicates.

Use a stable combination such as:

- semester
- day
- course code
- section
- slot
- room

as part of duplicate detection.

---

## OCR room matching

If OCR identifies a room such as:

`A4-404`

attempt to match it against the Elegant room inventory.

Students must not automatically create new Room records from OCR.

Unmatched rooms should be clearly flagged for review.

---

## OCR review

Never save OCR results immediately.

Required flow:

Upload screenshots
→ OCR
→ parse
→ normalize
→ deduplicate
→ conflict detection
→ preview
→ user edits if necessary
→ confirm
→ save

Screenshots should not be permanently retained unless future requirements
explicitly require it.

---

# 15. Feedback

Retain/reimplement the useful feedback functionality from the reference branch:

- public contact form
- admin message list
- mark as read

This feature is lower priority than Room / Booking / Access.

---

# 16. Survey

Retain/reimplement useful survey functionality:

- multiple rating categories
- survey submissions
- admin statistics

This feature is lower priority than the main room access flow.

---

# 17. Door Control

Keep a door-control abstraction such as:

`unlockDoorAction`

For now:

- simulated/stub implementation is acceptable
- no real hardware integration required

---

# 18. UI Terminology

Use the existing UI terminology system and:

`web/src/lib/ui-terms.ts`

as the baseline.

Do not reintroduce inconsistent wording.

Examples of canonical terminology already established include:

- ภาคการศึกษา
- เข้าใช้ห้อง
- ออกจากห้อง
- รหัสนักศึกษา
- ผู้ดูแลระบบ
- ลงทะเบียนแล้ว
- เฝ้าระวัง
- ถูกระงับ

New UI wording must follow the same style.

---

# 19. Reference Branch Rules

Reference branch:

`feature/lab-access-updates`

It contains useful ideas and implementations, but its requirements are not
automatically correct.

Important known difference:

The reference branch appears to require admin approval too broadly.

The V2 requirement is:

- scheduled access → automatic
- AUTO room booking → automatic
- MANUAL room booking → admin approval

When porting code:

reuse only pieces that match the V2 requirement.

Do not merge the branch.

---

# 20. Implementation Order

Implement in this order:

1. Room + booking domain/schema
2. Academic slot model
3. Central availability engine
4. Admin room configuration
5. Student room finder / booking UX
6. Available Now dashboard
7. Booking / access policy
8. Manual admin approval
9. Gate integration/security
10. Schedule management
11. BU Mobile OCR
12. Feedback
13. Survey
14. Door-control abstraction final cleanup

Each feature must be implemented and validated separately.

---

# 21. Scope Discipline

For every task:

Do not:

- implement future items early
- perform unrelated refactors
- modify production
- deploy
- merge the reference branch
- silently change requirements
- rewrite working systems unnecessarily

If implementation reveals a requirement conflict, stop and report it before
making a major design decision.
