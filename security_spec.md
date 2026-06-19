# Security Specification & Test-Driven Development (TDD) for Seaway Loadsheet Database

This document outlines the Attribute-Based Access Control (ABAC) security spec, data invariants, and hostile "Dirty Dozen" payloads attempting to breach or poison our Firestore database.

## 1. Data Invariants

1. **Shipment Ownership Integrity**
   - Every shipment document MUST have a valid `ownerId` field that strictly matches the authenticated user's `uid`.
   - Users are strictly forbidden from reading, listing, updating, or deleting any shipment documents owned by other users.
   - The primary ID and flight/awb details are protected from invalid types and excessive lengths.

2. **Flight Schedule Ownership Integrity**
   - Each flight schedule customization belongs to a specific user. Custom overrides are stored and queried using an `ownerId` matching `request.auth.uid`.
   - No user can view or alter another user's flight schedules.

3. **Loadsheet Ownership Integrity**
   - Each loadsheet document linked to a shipment must have an `ownerId` field matching the shipment's owner.
   - For additional protection, before writing/reading a loadsheet document, we verify that the user is the owner of the destination shipment.

4. **Temporal Integrity**
   - All modification timestamps (`updatedAt`) must be verified on the server side using the exact transaction timestamp (`request.time`).

---

## 2. The "Dirty Dozen" Threat Payloads

Below are the 12 malicious payloads designed to execute privilege escalation, state bypassing, ID poisoning, or denial of wallet.

### Threat 1: Identity Spoofing (Create Shipment for another User)
- **Target**: `shipments/{shipmentId}`
- **Payload**: `{ "id": 105, "awb": "123-45678901", "flight": "SQ218", "date": "15062026", "ownerId": "victim_user_uid" }`
- **Result**: `PERMISSION_DENIED`

### Threat 2: Cross-User Read (Get someone else's Shipment)
- **Target**: `/databases/(default)/documents/shipments/101`
- **Context**: Authenticated as `attacker_uid`, but `ownerId` in DB is `victim_uid`.
- **Result**: `PERMISSION_DENIED`

### Threat 3: Unsecured Collective Scraping (Blanket listing without filters)
- **Target**: Query `shipments` collection.
- **Context**: Query does not specify `where('ownerId', '==', 'attacker_uid')`.
- **Result**: `PERMISSION_DENIED`

### Threat 4: Shipment ID Poisoning & Buffer Overflow
- **Target**: `shipments/very_long_junk_id_designed_to_cause_huge_index_costs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...`
- **Result**: `PERMISSION_DENIED` (blocks non-standard/excessive document keys)

### Threat 5: Ghost Field Injection (Shadow fields designed to bypass structure)
- **Target**: `shipments/102`
- **Payload**: `{ "id": 102, "awb": "123-11111111", "flight": "SQ218", "date": "15062026", "ownerId": "attacker_uid", "isSuperAdmin": true, "extraEvilConfig": "malicious_script" }`
- **Result**: `PERMISSION_DENIED` (strict keys check fails)

### Threat 6: Modifying Read-Only / Immutable Fields
- **Target**: `shipments/103` (updating)
- **Payload**: `{ "id": 103, "ownerId": "attacker_uid", "flight": "EK407", "createdAt": "fake_client_timestamp" }` trying to alter or hijack `ownerId` or `id`.
- **Result**: `PERMISSION_DENIED`

### Threat 7: Injecting Malicious Types / Value Poisoning
- **Target**: `shipments/104` (updating)
- **Payload**: `{ "complete": "YES_OF_COURSE" }` (should be a boolean, but passed as a string).
- **Result**: `PERMISSION_DENIED`

### Threat 8: Hijacking Flight Schedules globally
- **Target**: `schedules/BI006` (updating standard values globally)
- **Payload**: `{ "flightCode": "BI006", "cutoff": "0001", "dest": "SIN", "ownerId": "attacker_uid" }` trying to change other's default details.
- **Result**: `PERMISSION_DENIED`

### Threat 9: Temporal Spoofing (Forged update timstamp)
- **Target**: `shipments/105`
- **Payload**: `{ "updatedAt": "2026-12-31T23:59:59.000Z" }` (forged in the future).
- **Result**: `PERMISSION_DENIED`

### Threat 10: Anonymous Writing when email verification is required
- **Target**: `shipments/106`
- **Context**: Authenticated user but `email_verified == false`.
- **Result**: `PERMISSION_DENIED`

### Threat 11: Spoofed Admin Action Block
- **Target**: Admin override action block
- **Context**: Non-admin user trying to access or manipulate restricted admin namespaces.
- **Result**: `PERMISSION_DENIED`

### Threat 12: Orphaned Loadsheets Insertion (Writing loadsheet for a non-existent shipment)
- **Target**: `loadsheets/999`
- **Payload**: `{ "shipmentId": 999, "ownerId": "attacker_uid" }` where shipment `999` does not exist in `shipments/999`.
- **Result**: `PERMISSION_DENIED`

---

## 3. The Test Runner Reference

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";

// Standard security enforcement tests executing all 12 behaviors listed above as assertFails queries.
```
