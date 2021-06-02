import { MigrationInterface, QueryRunner } from 'typeorm';

export class addOrderTimeAndDeliveryTime1622576502999
  implements MigrationInterface
{
  name = 'addOrderTimeAndDeliveryTime1622576502999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "delivery" ADD "orderTime" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TABLE "delivery" ADD "expectedDeliveryTime" TIMESTAMP`,
    );
    await queryRunner.query(
      `update delivery set "orderTime" = delivery."updatedAt", "expectedDeliveryTime" = "updatedAt"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery" DROP COLUMN "expectedDeliveryTime"`,
    );
    await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "orderTime"`);
  }
}
