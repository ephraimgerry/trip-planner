const repo = require("./trips.repository");
const commutesRepo = require("./commutes.repository");
const people = require("./participants.repository");
const members = require("./members.repository");
const places = require("../places/places.repository");
const { notFound, badRequest } = require("../../core/errors");

// Dates the trip covers, inclusive.
function dateRange(start, end) {
  const out = []; let d = start, guard = 0;
  while (d <= end && guard++ < 800) {
    out.push(d);
    const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + 1);
    d = x.toISOString().slice(0, 10);
  }
  return out;
}

// A stay covers a date inclusively at BOTH ends: the morning you check out is
// still a morning in that city. This is what makes a travel day show two cities
// and two hotels instead of silently dropping the one you're leaving.
// Anything with a date range answers "does this touch day D" the same way.
// A hire car held Fri–Mon shows on all four days; a flight shows on one.
const spanOn = (rows, date, from, to) => rows.filter(r => {
  const a = r[from], b = r[to] || r[from];
  return date >= a && date <= b;
});

// Ordered the way you actually move through them: earliest check-in first.
// That keeps a Shanghai -> Suzhou -> Shanghai day in the right sequence, which
// sorting departures-first would scramble.
const staysOn = (stays, date) => stays
  .filter(s => date >= s.check_in && date <= s.check_out)
  .map(s => ({ ...s, arriving: date === s.check_in, departing: date === s.check_out }))
  .sort((a, b) => (a.check_in < b.check_in ? -1 : a.check_in > b.check_in ? 1 : a.ord - b.ord));

// The full trip as the client wants to render it: normalised rows, reassembled.
function document(tripId, userId) {
  const trip = repo.byId(tripId);
  if (!trip) throw notFound("Trip not found");

  const stays = repo.stays(tripId);
  const rawCommutes = commutesRepo.forTrip(tripId);
  const items = repo.items(tripId);

  // who's coming, and when
  const parts = people.forTrip(tripId);
  const partDates = people.datesFor(tripId);
  const datesByPerson = {};
  for (const d of partDates) (datesByPerson[d.participant_id] ||= []).push(d);
  const ridersByCommute = {};
  for (const r of commutesRepo.participantsFor(tripId)) (ridersByCommute[r.commute_id] ||= []).push(r.participant_id);
  const sleepersByStay = {};
  for (const r of people.stayLinks(tripId)) (sleepersByStay[r.stay_id] ||= []).push(r.participant_id);

  const participants = parts.map(p => ({
    id: p.id, userId: p.user_id, name: p.name, email: p.email, colour: p.colour,
    isOrganiser: !!p.is_organiser, note: p.note,
    // no stints recorded = present for the whole trip
    dates: (datesByPerson[p.id] || []).map(d => ({ startDate: d.start_date, endDate: d.end_date, note: d.note })),
    wholeTrip: !(datesByPerson[p.id] || []).length,
  }));
  const presentOn = (date) => participants
    .filter(p => p.wholeTrip || p.dates.some(d => date >= d.startDate && date <= d.endDate))
    .map(p => p.id);

  const commutes = rawCommutes.map(c => {
    let attrs = {};
    try { attrs = JSON.parse(c.attrs || "{}"); } catch (e) {}
    return {
      id: c.id, kind: c.kind, groupId: c.group_id, chosen: !!c.chosen, direction: c.direction,
      startDate: c.start_date, startTime: c.start_time, endDate: c.end_date, endTime: c.end_time,
      spansDays: !!(c.end_date && c.end_date !== c.start_date),
      fromAreaId: c.from_area_id, toAreaId: c.to_area_id,
      fromPlaceId: c.from_place_id, toPlaceId: c.to_place_id,
      fromLabel: c.from_label, toLabel: c.to_label,
      label: c.label, operator: c.operator, code: c.code,
      status: c.status, bookingRef: c.booking_ref,
      price: c.price_amount, currency: c.price_currency, durationMin: c.duration_min,
      // the distinction that separates a real journey from a taxi across town
      crossesArea: !!(c.from_area_id && c.to_area_id && c.from_area_id !== c.to_area_id),
      attrs, note: c.note, ord: c.ord,
      participantIds: ridersByCommute[c.id] || [],
    };
  });

  const itemsByDate = {};
  for (const it of items) (itemsByDate[it.date] ||= []).push(it);

  const days = dateRange(trip.start_date, trip.end_date).map((date, i) => {
    const on = staysOn(stays, date);
    const dayCommutes = spanOn(commutes.filter(c => c.chosen), date, "startDate", "endDate");

    // Where you were that day, in order. Beds are the spine of a day, and only
    // CONSECUTIVE repeats collapse, so A → B → A survives.
    const stayAreas = on.map(s => s.area_id).filter(Boolean);
    const base = stayAreas.filter((a, n) => n === 0 || stayAreas[n - 1] !== a);
    const slept = new Set(stayAreas);
    // Somewhere you went and came back from without sleeping there: a day trip.
    const excursions = [...new Set(dayCommutes
      .filter(c => c.crossesArea)
      .map(c => c.toAreaId)
      .filter(a => a && !slept.has(a)))];
    const areaIds = (base.length === 1 && excursions.length)
      ? [base[0], ...excursions, base[0]]                     // out and back
      : base.concat(excursions.filter(a => a !== base[base.length - 1]));

    return {
      date, index: i + 1,
      areaIds,
      // A travel day means leaving the area — not merely that some transport
      // exists on it. A hotel change across town is not travel.
      travel: new Set(areaIds).size > 1,
      stays: on.map(s => ({
        stayId: s.id, areaId: s.area_id, placeId: s.place_id,
        checkIn: s.check_in, checkOut: s.check_out,
        checkInTime: s.check_in_time, checkOutTime: s.check_out_time,
        booked: !!s.booked,
        arriving: s.arriving, departing: s.departing,
        participantIds: sleepersByStay[s.id] || [],
      })),
      // only the chosen answer for each hop, plus anything held across the day
      commuteIds: dayCommutes.map(c => c.id),
      participantIds: presentOn(date),
      items: (itemsByDate[date] || []).map(it => ({
        id: it.id, placeId: it.place_id, slot: it.slot,
        startTime: it.start_time, endTime: it.end_time, ord: it.ord, note: it.note,
      })),
    };
  });

  return {
    id: trip.id, name: trip.name, startDate: trip.start_date, endDate: trip.end_date,
    note: trip.note, createdBy: trip.created_by,
    createdAt: trip.created_at, updatedAt: trip.updated_at,
    stays: stays.map(s => ({
      id: s.id, areaId: s.area_id, placeId: s.place_id, checkIn: s.check_in, checkOut: s.check_out,
      checkInTime: s.check_in_time, checkOutTime: s.check_out_time,
      booked: !!s.booked, bookingRef: s.booking_ref, note: s.note,
      participantIds: sleepersByStay[s.id] || [],
    })),
    commutes,
    participants,
    alternatives: repo.alternatives(tripId).map(a => ({
      id: a.id, placeId: a.place_id, date: a.date, note: a.note,
    })),
    days,
    members: members.listFor(tripId),
    settings: repo.settings(tripId, userId) || null,
  };
}

// Suggestions for a day: your saved shortlist for this trip, narrowed to the
// areas you're actually in that day, minus anything already scheduled or visited.
// Curated on purpose — this never reaches out to a places API.
function suggestionsFor(tripId, date, userId, { allAreas = false } = {}) {
  const doc = document(tripId, userId);
  const day = doc.days.find(d => d.date === date);
  if (!day) throw badRequest("That date isn't in this trip");

  const scheduled = new Set(day.items.map(i => i.placeId));
  const visited = new Set(
    places.userPlaces(userId).filter(u => u.status === "visited").map(u => u.place_id));
  const areas = new Set(day.areaIds);

  return doc.alternatives
    .map(a => ({ alt: a, place: places.byId(a.placeId) }))
    .filter(({ alt, place }) => place
      && !scheduled.has(place.id)
      && !visited.has(place.id)                                  // been there — don't suggest it again
      && (allAreas || !areas.size || areas.has(place.area_id))
      && (!alt.date || alt.date === date))
    .map(({ alt, place }) => ({ ...place, altId: alt.id, note: alt.note }));
}

module.exports = { document, suggestionsFor, dateRange, staysOn };
