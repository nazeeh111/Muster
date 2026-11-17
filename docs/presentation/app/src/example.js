export function example() {
  return {
    format: "muster/v1",
    title: "Community pantry · weekend rota",
    roles: [
      { id: "driver", label: "Driver" },
      { id: "host", label: "Welcome" },
      { id: "packer", label: "Packing" },
    ],
    blocks: [
      { id: "fri", label: "Friday · afternoon" },
      { id: "sat", label: "Saturday · morning" },
      { id: "sun", label: "Sunday · morning" },
    ],
    people: [
      {
        id: "ada",
        name: "Ada",
        roles: ["driver"],
        availability: ["fri", "sat"],
        maxAssignments: 1,
      },
      {
        id: "cy",
        name: "Cy",
        roles: ["driver", "packer"],
        availability: ["sun"],
        maxAssignments: 1,
      },
      {
        id: "bob",
        name: "Bob",
        roles: ["host"],
        availability: ["sat"],
        maxAssignments: 1,
      },
      {
        id: "dee",
        name: "Dee",
        roles: ["packer", "host"],
        availability: ["fri", "sat", "sun"],
        maxAssignments: 2,
      },
      {
        id: "eve",
        name: "Eve",
        roles: ["packer"],
        availability: ["sat", "sun"],
        maxAssignments: 2,
      },
    ],
    positions: [
      {
        id: "collection",
        label: "Collect produce",
        blockId: "fri",
        roleId: "driver",
        previousPersonId: "ada",
      },
      {
        id: "delivery",
        label: "Deliver parcels",
        blockId: "sat",
        roleId: "driver",
        previousPersonId: "cy",
      },
      {
        id: "welcome",
        label: "Welcome desk",
        blockId: "sat",
        roleId: "host",
        previousPersonId: "bob",
        lockedPersonId: "bob",
      },
      {
        id: "packing",
        label: "Pack parcels",
        blockId: "sat",
        roleId: "packer",
        previousPersonId: "dee",
      },
      {
        id: "restock",
        label: "Restock pantry",
        blockId: "sun",
        roleId: "packer",
        previousPersonId: "eve",
      },
    ],
  };
}
