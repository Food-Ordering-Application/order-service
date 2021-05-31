import {MigrationInterface, QueryRunner} from "typeorm";

export class addDeliveryActorInformation1622395142476 implements MigrationInterface {
    name = 'addDeliveryActorInformation1622395142476'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delivery" ADD "customerName" character varying`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD "customerPhoneNumber" character varying`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD "restaurantName" character varying`);
        await queryRunner.query(`ALTER TABLE "delivery" ADD "restaurantPhoneNumber" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "restaurantPhoneNumber"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "restaurantName"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "customerPhoneNumber"`);
        await queryRunner.query(`ALTER TABLE "delivery" DROP COLUMN "customerName"`);
    }

}
