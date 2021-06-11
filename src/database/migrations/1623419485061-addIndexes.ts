import { MigrationInterface, QueryRunner } from 'typeorm';

export class addIndexes1623419485061 implements MigrationInterface {
  name = 'addIndexes1623419485061';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery" ADD "totalDeliveryDistance" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c93f22720c77241d2476c07cab" ON "order" ("restaurantId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7bb07d3c6e225d75d8418380f1" ON "order" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_23db16cabddb9d10a73b5287bf" ON "order" ("updatedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a9573d6a1fb982772a9123320" ON "order" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_caa901372ba1b5aa30d1950b45" ON "order_item" ("menuItemId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_646bf9ece6f45dbe41c203e06e" ON "order_item" ("orderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_65cb07f36cad55dd27e48207f0" ON "order_item_topping" ("toppingItemId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_411d2475688192aed75f9f8854" ON "order_item_topping" ("orderItemId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_263649c8697ffc70b85b11f0eb" ON "delivery" ("customerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a0b5d55dd786efe347e616a5c" ON "delivery" ("driverId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2512b299aef1ca0394ff11e609" ON "delivery" ("orderTime") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_31f7c94e29bdfcffcf80a49761" ON "delivery" ("deliveredAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb9f9429c00285dac771993ac5" ON "paypal_payment" ("captureId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7e1fb96f14c19e5b35a58e69f2" ON "paypal_payment" ("refundId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abea76a6a71ddad5ccbf9b1b87" ON "paypal_payment" ("paypalOrderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4a2cfad93a696ab337c4070a43" ON "invoice" ("paypalInvoiceId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_4a2cfad93a696ab337c4070a43"`);
    await queryRunner.query(`DROP INDEX "IDX_abea76a6a71ddad5ccbf9b1b87"`);
    await queryRunner.query(`DROP INDEX "IDX_7e1fb96f14c19e5b35a58e69f2"`);
    await queryRunner.query(`DROP INDEX "IDX_eb9f9429c00285dac771993ac5"`);
    await queryRunner.query(`DROP INDEX "IDX_31f7c94e29bdfcffcf80a49761"`);
    await queryRunner.query(`DROP INDEX "IDX_2512b299aef1ca0394ff11e609"`);
    await queryRunner.query(`DROP INDEX "IDX_9a0b5d55dd786efe347e616a5c"`);
    await queryRunner.query(`DROP INDEX "IDX_263649c8697ffc70b85b11f0eb"`);
    await queryRunner.query(`DROP INDEX "IDX_411d2475688192aed75f9f8854"`);
    await queryRunner.query(`DROP INDEX "IDX_65cb07f36cad55dd27e48207f0"`);
    await queryRunner.query(`DROP INDEX "IDX_646bf9ece6f45dbe41c203e06e"`);
    await queryRunner.query(`DROP INDEX "IDX_caa901372ba1b5aa30d1950b45"`);
    await queryRunner.query(`DROP INDEX "IDX_7a9573d6a1fb982772a9123320"`);
    await queryRunner.query(`DROP INDEX "IDX_23db16cabddb9d10a73b5287bf"`);
    await queryRunner.query(`DROP INDEX "IDX_7bb07d3c6e225d75d8418380f1"`);
    await queryRunner.query(`DROP INDEX "IDX_c93f22720c77241d2476c07cab"`);
    await queryRunner.query(
      `ALTER TABLE "delivery" DROP COLUMN "totalDeliveryDistance"`,
    );
  }
}
