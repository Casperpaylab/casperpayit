import request from "supertest";
import facilitatorStub from "../server/facilitatorStub.js";

describe("Facilitator stub endpoints", () => {
  test("GET /supported returns supported array", async () => {
    const res = await request(facilitatorStub).get('/supported');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('supported');
    expect(Array.isArray(res.body.supported)).toBe(true);
  });

  test("POST /verify returns 400 when missing payment info", async () => {
    const res = await request(facilitatorStub).post('/verify').send({});
    expect(res.status).toBe(400);
    expect(res.body.verified).toBe(false);
  });

  test("POST /verify accepts stub paymentPayload", async () => {
    const res = await request(facilitatorStub).post('/verify').send({ paymentPayload: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });

  test("POST /settle returns settled=true", async () => {
    const res = await request(facilitatorStub).post('/settle').send({});
    expect(res.status).toBe(200);
    expect(res.body.settled).toBe(true);
  });
});
